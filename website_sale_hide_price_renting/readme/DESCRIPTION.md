`website_sale_hide_price` hides the price on `website_sale.product_price`
(the `div[name='product_price']`) when a website or product has prices
hidden. `website_sale_renting` adds its own sibling block right after that
div - the rental total price (`o_renting_total_price`, e.g. "24.99 € / 24
Hours") - which is outside the div `website_sale_hide_price` guards, so it
kept rendering even with prices hidden.

This module extends that sibling block's own visibility condition so it
respects the same hide-price setting.
