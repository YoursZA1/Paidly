import PropTypes from "prop-types";

export const clientPropType = PropTypes.shape({
  id: PropTypes.string,
  name: PropTypes.string,
  email: PropTypes.string,
  phone: PropTypes.string,
  address: PropTypes.string
});

export const bankingDetailPropType = PropTypes.shape({
  id: PropTypes.string,
  bank_name: PropTypes.string,
  account_name: PropTypes.string,
  payment_method: PropTypes.string
});

export const invoiceDataPropType = PropTypes.shape({
  client_id: PropTypes.string,
  project_title: PropTypes.string,
  project_description: PropTypes.string,
  total_amount: PropTypes.number,
  delivery_date: PropTypes.string,
  delivery_address: PropTypes.string,
  banking_detail_id: PropTypes.string,
  notes: PropTypes.string,
  terms_conditions: PropTypes.string
});

export const quoteItemPropType = PropTypes.shape({
  service_name: PropTypes.string,
  description: PropTypes.string,
  quantity: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  unit_price: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  total_price: PropTypes.oneOfType([PropTypes.string, PropTypes.number])
});

export const quoteDataPropType = PropTypes.shape({
  client_id: PropTypes.string,
  project_title: PropTypes.string,
  project_description: PropTypes.string,
  valid_until: PropTypes.string,
  subtotal: PropTypes.number,
  tax_rate: PropTypes.number,
  tax_amount: PropTypes.number,
  total_amount: PropTypes.number,
  notes: PropTypes.string,
  terms_conditions: PropTypes.string,
  items: PropTypes.arrayOf(quoteItemPropType)
});
