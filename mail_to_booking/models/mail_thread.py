import email
import email.policy
import logging
import uuid
import xmlrpc.client as xmlrpclib

from odoo import api, models

_logger = logging.getLogger(__name__)

MAIL_TO_BOOKING_MODEL = "mail.to.booking"


class MailThread(models.AbstractModel):
    _inherit = "mail.thread"

    @api.model
    def message_process(
        self,
        model,
        message,
        custom_values=None,
        save_original=False,
        strip_attachments=False,
        thread_id=None,
    ):
        if model == MAIL_TO_BOOKING_MODEL:
            message = self._mail_to_booking_bypass_thread_matching(message)
        return super().message_process(
            model,
            message,
            custom_values=custom_values,
            save_original=save_original,
            strip_attachments=strip_attachments,
            thread_id=thread_id,
        )

    @api.model
    def _mail_to_booking_bypass_thread_matching(self, message):
        # message_process() drops any e-mail whose Message-Id was already seen
        # by *any* mailbox/model in this database, permanently, and separately
        # re-attaches a mail to whatever thread its References/In-Reply-To
        # headers point to *before* ever considering the fallback model.
        # buchungen@weingartmair.eu regularly receives forwards of a booking
        # mail that already reached Odoo once through another mailbox (e.g.
        # it landed in the "Dropped Mails" fallback channel first) and whose
        # References header still points at that original message, so both
        # checks keep re-attaching the forward to that old, unrelated thread
        # instead of ever creating a mail.to.booking record. Strip everything
        # that ties this mail to a prior thread so it is always treated as a
        # brand new message, keeping the original Message-Id for traceability.
        if isinstance(message, xmlrpclib.Binary):
            raw = bytes(message.data)
        elif isinstance(message, str):
            raw = message.encode("utf-8")
        else:
            raw = message

        parsed = email.message_from_bytes(raw, policy=email.policy.SMTP)
        original_message_id = parsed.get("Message-Id")
        if not original_message_id:
            return message

        new_message_id = f"<mail-to-booking-{uuid.uuid4().hex}@{self.env.cr.dbname}>"
        del parsed["Message-Id"]
        parsed["Message-Id"] = new_message_id
        if not parsed.get("X-Mail-To-Booking-Original-Message-Id"):
            parsed["X-Mail-To-Booking-Original-Message-Id"] = original_message_id
        del parsed["References"]
        del parsed["In-Reply-To"]
        _logger.info(
            "Mail to Booking: rewrote Message-Id %s to %s and dropped "
            "References/In-Reply-To to bypass the mail gateway duplicate and "
            "thread-matching checks for buchungen@weingartmair.eu.",
            original_message_id,
            new_message_id,
        )
        return parsed.as_bytes()
