==================================
Website Sale Hide Price - Renting
==================================

..
   !! This file is manually kept in sync with the readme/*.md fragments. !!
   !! Update the fragment, then mirror the change here.                 !!

Also hide the rental total price block that website_sale_renting adds to
the product page when website_sale_hide_price is active.

**Table of contents**

.. contents::
   :local:

Description
===========

`website_sale_hide_price` hides the price on `website_sale.product_price`
(the `div[name='product_price']`) when a website or product has prices
hidden. `website_sale_renting` adds its own sibling block right after that
div - the rental total price (`o_renting_total_price`, e.g. "24.99 € / 24
Hours") - which is outside the div `website_sale_hide_price` guards, so it
kept rendering even with prices hidden.

This module extends that sibling block's own visibility condition so it
respects the same hide-price setting.

Configuration
=============

No configuration needed beyond `website_sale_hide_price`'s own settings
(website-level "Hide prices on website" toggle, or the per-product "Hide
prices on website" checkbox).

Bug Tracker
===========

Bugs and feature requests should be reported to mytime.click at
https://mytime.click.

Credits
=======

Authors
-------

* mytime.click

Maintainers
-----------

This module is maintained by mytime.click.
