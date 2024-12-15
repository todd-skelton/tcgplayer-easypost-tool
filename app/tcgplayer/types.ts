export type TcgPlayerShippingMethod =
  | `Standard${string}`
  | `Expedited${string}`;

export type TcgPlayerOrder = {
  "Order #": string;
  FirstName: string;
  LastName: string;
  Address1: string;
  Address2: string;
  City: string;
  State: string;
  PostalCode: string | number;
  Country: string;
  "Order Date": string;
  "Product Weight": number;
  "Shipping Method": TcgPlayerShippingMethod;
  "Item Count": number;
  "Value Of Products": number;
  "Shipping Fee Paid": number;
  "Tracking #": string;
  Carrier: string;
};
