export type EasyPostAddress = {
    name: string
    company?: string
    phone?: string
    email?: string
    street1: string
    street2?: string
    city: string
    state: string
    zip: string
    country: string
}

export type EasyPostPackageType = "Letter" | "Flat" | "Parcel";

export type EasyPostParcel = {
    length: number
    width: number
    height: number
    weight: number
    predefined_package: EasyPostPackageType
}

export type EasyPostService = "First" | "GroundAdvantage";

export type EasyPostShipment = {
    reference: string
    to_address: EasyPostAddress
    from_address: EasyPostAddress
    parcel: EasyPostParcel
    carrier: "USPS"
    service: EasyPostService
    options: {
        label_format: "PNG" | "PDF",
        label_size: "4x6" | "7x3" | "6x4",
        invoice_number: string
        delivery_confirmation: 'NO_SIGNATURE' | 'SIGNATURE'
    }
}

export type EasyPostBatch = {
    id: string;
    object: string;
    mode: string;
    state: string;
    num_shipments: number;
    reference?: string;
    created_at: string;
    updated_at: string;
    scan_form?: string;
    shipments: EasyPostShipment[];
    status: {
        created: number;
        queued_for_purchase: number;
        creation_failed: number;
        postage_purchased: number;
        postage_purchase_failed: number;
    };
    pickup?: string;
    label_url?: string;
}