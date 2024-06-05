export type TcgPlayerShippingMethod = 'Standard' | 'Priority';

export type TcgPlayerOrder = {
    "Order #": string
    "FirstName": string
    "LastName": string
    "Address1": string
    "Address2": string
    "City": string
    "State": string
    "PostalCode": string
    "Country": string
    "Order Date": string
    "Product Weight": number
    "Shipping Method": TcgPlayerShippingMethod
    "Item Count": number
    "Value of Products": string
    "Shipping Fee Paid": string | undefined
    "Tracking #": string | undefined
}