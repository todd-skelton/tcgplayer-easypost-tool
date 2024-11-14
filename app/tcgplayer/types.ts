export type TcgPlayerShippingMethod = `Standard${string}` | `Priority${string}`;

export type TcgPlayerOrder = {
  "Order #": string;
  FirstName: string;
  LastName: string;
  Address1: string;
  Address2: string;
  City: string;
  State: string;
  PostalCode: string;
  Country: string;
  "Order Date": string;
  "Product Weight": string;
  "Shipping Method": TcgPlayerShippingMethod;
  "Item Count": string;
  "Value Of Products": string;
  "Shipping Fee Paid": string;
  "Tracking #": string;
  Carrier: string;
};
