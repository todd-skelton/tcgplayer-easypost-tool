import { Link, Button, Container, FormControl, InputLabel, MenuItem, Select, SelectChangeEvent, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField, Typography } from "@mui/material";
import type { MetaFunction } from "@remix-run/node";
import currency from "currency.js";
import { csv2json, json2csv } from "json-2-csv";
import { useState } from "react";
import { EasyPostAddress, EasyPostPackageType, EasyPostParcel, EasyPostService, EasyPostShipment } from "~/easypost/types";
import { useLocalStorageState } from "~/hooks/useLocalStorageState";
import { TcgPlayerOrder, TcgPlayerShippingMethod } from "~/tcgplayer/types";
import { Link as RemixLink } from "@remix-run/react";

type ShipmentToOrderMap = {
  [reference: string]: string[]
}

type ShippingSettings = {
  fromAddress: EasyPostAddress;
  letter: {
    labelSize: '4x6' | '7x3' | '6x4';
    baseWeight: number;
    perItemWeight: number;
    maxItemCount: number;
    maxValue: number;
    length: number;
    width: number;
    height: number;
  },
  flat: {
    labelSize: '4x6' | '7x3' | '6x4';
    baseWeight: number;
    perItemWeight: number;
    maxItemCount: number;
    maxValue: number;
    length: number;
    width: number;
    height: number;
  },
  parcel: {
    labelSize: '4x6' | '7x3' | '6x4';
    baseWeight: number;
    perItemWeight: number;
    length: number;
    width: number;
    height: number;
  }
  labelFormat: 'PDF' | 'PNG';
}

const csv2jsonOptions = {
  delimiter: {
    field: ',',
    eol: '\r\n'
  }
}

const SLEEVED_CARD_OZ = 0.09;
const NO_10_ENVELOPE_OZ = 0.20;
const TEAM_BAG_OZ = 0.03;
const PACKING_SLIP_OZ = 0.08;
const BUBBLE_MAILER_5x7_OZ = 0.30;
const BUBBLE_MAILER_7x9_OZ = 0.45;
const RACK_CARD_OZ = 0.18;
const BINDER_PAGE_OZ = 0.14;
const LETTER_PAPER_OZ = 0.20;

const calculateService = (itemCount: number, valueOfProducts: number, shippingMethod: TcgPlayerShippingMethod, settings: ShippingSettings): EasyPostService => {
  if (shippingMethod === 'Priority') return 'GroundAdvantage';
  if (valueOfProducts >= settings.flat.maxValue) return 'GroundAdvantage';
  if (itemCount > settings.flat.maxItemCount) return 'GroundAdvantage';
  return 'First';
}

const calculatePackageType = (itemCount: number, valueOfProducts: number, shippingMethod: TcgPlayerShippingMethod, settings: ShippingSettings): EasyPostPackageType => {
  if (itemCount > settings.flat.maxItemCount) return 'Parcel';
  if (shippingMethod === 'Priority') return 'Parcel';
  if (valueOfProducts >= settings.flat.maxValue) return 'Parcel';
  if (itemCount > settings.letter.maxItemCount) return 'Flat';
  return 'Letter';
}

const getDeliveryConfirmation = (valueOfProducts: currency) => {
  if (valueOfProducts.value >= currency(250).value) return 'SIGNATURE';
  else return 'NO_SIGNATURE';
}

const downloadCsvByLabelSize = (labelSize: string, shipments: EasyPostShipment[]) => {
  const filteredShipments = shipments.filter(shipment => shipment.options.label_size === labelSize);
  const csvData = json2csv(filteredShipments, csv2jsonOptions);
  const blob = new Blob([csvData], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `EasyPostShipmentImport_${labelSize}_${new Date().toISOString().replace(/[:T-]/g, '.')}.csv`;
  link.click();
};

const mergeOrdersByAddress = (orders: TcgPlayerOrder[]): [TcgPlayerOrder[], ShipmentToOrderMap] => {
  const shipmentToOrderMap: ShipmentToOrderMap = {};
  const mergedOrders = orders.reduce((acc: { [key: string]: TcgPlayerOrder }, order) => {
    if (order['Order #'] === '') return acc;

    const addressKey = `${order.Address1}-${order.Address2}-${order.City}-${order.State}-${order.PostalCode}`;

    if (!acc[addressKey]) {
      acc[addressKey] = { ...order };
      shipmentToOrderMap[order['Order #']] = [order['Order #']];
    } else {
      shipmentToOrderMap[acc[addressKey]['Order #']] = [...shipmentToOrderMap[acc[addressKey]['Order #']], order['Order #']]
      acc[addressKey]['Item Count'] += order['Item Count'];
      acc[addressKey]['Value of Products'] = currency(acc[addressKey]['Value of Products']).add(order['Value of Products']).toString();
      if(order['Shipping Method'] === 'Priority') {
        acc[addressKey]['Shipping Method'] = 'Priority';
      }
    }

    return acc;
  }, {});

  return [Object.values(mergedOrders), shipmentToOrderMap];
}

const mapOrderToAddress = (order: TcgPlayerOrder): EasyPostAddress => {
  return {
    name: `${order.FirstName} ${order.LastName}`,
    street1: order.Address1,
    street2: order.Address2,
    city: order.City,
    state: order.State,
    zip: order.PostalCode,
    country: order.Country
  };
}

function mapOrderToShipment(order: TcgPlayerOrder, settings: ShippingSettings): EasyPostShipment {
  const toAddress: EasyPostAddress = mapOrderToAddress(order);

  const itemCount = order['Item Count'];
  const valueOfProducts = currency(order['Value of Products']);
  const shippingMethod = order['Shipping Method'];

  const service = calculateService(itemCount, valueOfProducts.value, shippingMethod, settings);

  const parcelType = calculatePackageType(itemCount, valueOfProducts.value, shippingMethod, settings);

  const parcel: EasyPostParcel =
    service === 'First' && parcelType === 'Letter'
      ? {
        length: settings.letter.length,
        width: settings.letter.width,
        height: settings.letter.height,
        weight: Math.ceil((settings.letter.baseWeight + itemCount * settings.letter.perItemWeight) * 100) / 100,
        predefined_package: 'Letter'
      }
      : service === 'First' && parcelType === 'Flat'
      ? {
        length: settings.flat.length,
        width: settings.flat.width,
        height: settings.flat.height,
        weight: Math.ceil((settings.flat.baseWeight + itemCount * settings.flat.perItemWeight) * 100) / 100,
        predefined_package: 'Flat'
      }
      : {
        length: settings.parcel.length,
        width: settings.parcel.width,
        height: settings.parcel.height,
        weight: Math.ceil((settings.parcel.baseWeight + itemCount * settings.parcel.perItemWeight) * 100) / 100,
        predefined_package: 'Parcel'
      }

  const labelSize = parcelType === 'Letter'
    ? settings.letter.labelSize
    : parcelType === 'Flat'
      ? settings.flat.labelSize
      : settings.parcel.labelSize;

  const shipment: EasyPostShipment = {
    reference: order['Order #'],
    to_address: toAddress,
    from_address: settings.fromAddress,
    parcel: parcel,
    carrier: 'USPS',
    service: service,
    options: {
      label_format: settings.labelFormat,
      label_size: labelSize,
      invoice_number: order['Order #'],
      delivery_confirmation: getDeliveryConfirmation(valueOfProducts)
    }
  };

  return shipment;
}

function mapTcgPlayerOrdersToEasyPostShipments(tcgPlayerOrders: TcgPlayerOrder[], settings: ShippingSettings): EasyPostShipment[] {
  return tcgPlayerOrders.map(order => mapOrderToShipment(order, settings));
}

export const meta: MetaFunction = () => {
  return [
    { title: "TCG Player EasyPost Tool" },
    { name: "description", content: "TCG Player EasyPost Tool" },
  ];
};

const defaultAddress = {
  name: '',
  street1: '',
  city: '',
  state: '',
  zip: '',
  country: 'US'
}

const defaultPerItemWeight = SLEEVED_CARD_OZ;
const defaultLetterBaseWeight = NO_10_ENVELOPE_OZ + RACK_CARD_OZ + BINDER_PAGE_OZ + PACKING_SLIP_OZ;
const defaultFlatBaseWeight = BUBBLE_MAILER_5x7_OZ + TEAM_BAG_OZ * 2 + PACKING_SLIP_OZ;
const defaultParcelBaseWeight = BUBBLE_MAILER_7x9_OZ + TEAM_BAG_OZ * 4 + LETTER_PAPER_OZ + PACKING_SLIP_OZ;
const defaultMaxLetterItemCount = 24;
const defaultMaxFlatItemCount = 100;
const defaultMaxLetterValue = 50;
const defaultMaxFlatValue = 50;

const defaultShippingSettings: ShippingSettings = {
  fromAddress: defaultAddress,
  letter: {
    labelSize: '7x3',
    baseWeight: defaultLetterBaseWeight,
    maxItemCount: defaultMaxLetterItemCount,
    maxValue: defaultMaxLetterValue,
    length: 9.5,
    width: 4.125,
    height: 0.25,
    perItemWeight: defaultPerItemWeight
  },
  flat: {
    labelSize: '4x6',
    baseWeight: defaultFlatBaseWeight,
    maxItemCount: defaultMaxFlatItemCount,
    maxValue: defaultMaxFlatValue,
    length: 5,
    width: 7,
    height: 0.75,
    perItemWeight: defaultPerItemWeight
  },
  parcel: {
    labelSize: '4x6',
    baseWeight: defaultParcelBaseWeight,
    length: 7,
    width: 9,
    height: 0.75,
    perItemWeight: defaultPerItemWeight
  },
  labelFormat: 'PDF'
}

export default function Index() {
  const [csvOutput, setCsvOutput] = useState('');
  const [orders, setOrders] = useState<TcgPlayerOrder[]>([]);
  const [shipments, setShipments] = useState<EasyPostShipment[]>([]);
  const [shipmentToOrderMap, setShipmentToOrderMap] = useState<ShipmentToOrderMap>({});
  const [shippingSettings, setShippingSettings] = useLocalStorageState<ShippingSettings>('shippingSettings', defaultShippingSettings);

  const shippingSettingsOrDefault = shippingSettings ?? defaultShippingSettings;

  const handleFileInput = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files![0];
    const reader = new FileReader();

    reader.onload = (event) => {
      if (shippingSettingsOrDefault.fromAddress === undefined) return;
      const csvInput = event.target!.result as string;
      var orders: TcgPlayerOrder[] = csv2json(csvInput, csv2jsonOptions) as TcgPlayerOrder[];
      const [mergedOrders, shipmentToOrderMap] = mergeOrdersByAddress(orders);
      setOrders(mergedOrders);
      setShipmentToOrderMap(shipmentToOrderMap);
      var easyPostShipments = mapTcgPlayerOrdersToEasyPostShipments(mergedOrders, shippingSettingsOrDefault);
      setCsvOutput(json2csv(easyPostShipments));
      setShipments(easyPostShipments);
    };

    reader.readAsText(file);
  };

  const downloadCsv = () => {
    const labelSizes = ['4x6', '7x3', '6x4'] as const;
    for (const labelSize of labelSizes) {
      const shipmentsByLabelSize = shipments.filter(shipment => shipment.options.label_size === labelSize);
      if (shipmentsByLabelSize.length > 0) {
        downloadCsvByLabelSize(labelSize, shipmentsByLabelSize);
      }
    }
  };

  const handleUpdateShippingSettings = (key: keyof ShippingSettings) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement> | SelectChangeEvent<string>) => {
    setShippingSettings({ ...shippingSettingsOrDefault, [key]: e.target.value });
  }

  const handleUpdateFromAddress = (key: keyof EasyPostAddress) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement> | SelectChangeEvent<string>) => {
    setShippingSettings({ ...shippingSettingsOrDefault, fromAddress: { ...shippingSettingsOrDefault.fromAddress, [key]: e.target.value } });
  }

  const handleUpdateLetterSettings = (key: keyof ShippingSettings['letter']) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement> | SelectChangeEvent<string>) => {
    setShippingSettings({ ...shippingSettingsOrDefault, letter: { ...shippingSettingsOrDefault.letter, [key]: e.target.value } });
  }

  const handleUpdateFlatSettings = (key: keyof ShippingSettings['flat']) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement> | SelectChangeEvent<string>) => {
    setShippingSettings({ ...shippingSettingsOrDefault, flat: { ...shippingSettingsOrDefault.flat, [key]: e.target.value } });
  }

  const handleUpdateParcelSettings = (key: keyof ShippingSettings['parcel']) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement> | SelectChangeEvent<string>) => {
    setShippingSettings({ ...shippingSettingsOrDefault, parcel: { ...shippingSettingsOrDefault.parcel, [key]: e.target.value } });
  }

  return (
    <Container>
      <Stack spacing={2} margin={2}>
        <Link component={RemixLink} to="/how-to-use">How To Use</Link>
        <Typography variant="h6">From Address</Typography>
        <Stack direction='row' spacing={2}>
          <TextField
            label="Sender"
            value={shippingSettingsOrDefault.fromAddress.name}
            fullWidth
            onChange={handleUpdateFromAddress('name')}
          />
          <TextField
            label="Company (Optional)"
            value={shippingSettingsOrDefault.fromAddress.company ?? ''}
            onChange={handleUpdateFromAddress('company')}
            fullWidth
          />
        </Stack>
        <Stack direction='row' spacing={2}>
          <TextField
            label="Phone (Optional)"
            value={shippingSettingsOrDefault.fromAddress.phone ?? ''}
            onChange={handleUpdateFromAddress('phone')}
            fullWidth
          />
          <TextField
            label="Email (Optional)"
            value={shippingSettingsOrDefault.fromAddress.email ?? ''}
            onChange={handleUpdateFromAddress('email')}
            fullWidth
          />
        </Stack>
        <Stack direction='row' spacing={2}>
          <TextField
            label="Street 1"
            value={shippingSettingsOrDefault.fromAddress.street1}
            onChange={handleUpdateFromAddress('street1')}
            fullWidth
          />
        </Stack>
        <Stack direction='row' spacing={2}>
          <TextField
            label="Street 2 (Optional)"
            value={shippingSettingsOrDefault.fromAddress.street2}
            onChange={handleUpdateFromAddress('street2')}
            fullWidth
          />
        </Stack>
        <Stack direction='row' spacing={2}>
          <TextField
            label="City"
            value={shippingSettingsOrDefault.fromAddress.city}
            onChange={handleUpdateFromAddress('city')}
            fullWidth
          />
          <TextField
            label="State"
            value={shippingSettingsOrDefault.fromAddress.state}
            onChange={handleUpdateFromAddress('state')}
            fullWidth
          />
          <TextField
            label="Zip"
            value={shippingSettingsOrDefault.fromAddress.zip}
            onChange={handleUpdateFromAddress('zip')}
            fullWidth
          />
          <TextField
            label="Country"
            value={shippingSettingsOrDefault.fromAddress.country}
            onChange={handleUpdateFromAddress('country')}
            fullWidth
          />
        </Stack>
        <Typography variant="h6">Letter Settings</Typography>
        <Stack direction='row' spacing={2}>
          <FormControl fullWidth>
            <InputLabel id="letter-label-size-label">Label Size</InputLabel>
            <Select
              id="letter-label-size"
              labelId="letter-label-size-label"
              value={shippingSettingsOrDefault.letter.labelSize}
              label="Letter Label Size"
              onChange={handleUpdateLetterSettings('labelSize')}
            >
              <MenuItem value='4x6'>4x6</MenuItem>
              <MenuItem value='7x3'>7x3</MenuItem>
              <MenuItem value='6x4'>6x4</MenuItem>
            </Select>
          </FormControl>
          <TextField
            label="Per Item Weight (oz)"
            value={shippingSettingsOrDefault.letter.perItemWeight}
            onChange={handleUpdateLetterSettings('perItemWeight')}
            fullWidth
          />
          <TextField
            label="Base Weight (oz)"
            value={shippingSettingsOrDefault.letter.baseWeight}
            onChange={handleUpdateLetterSettings('baseWeight')}
            fullWidth
          />
          <TextField
            label="Max Item Count"
            value={shippingSettingsOrDefault.letter.maxItemCount}
            onChange={handleUpdateLetterSettings('maxItemCount')}
            fullWidth
          />
          </Stack>
          <Stack direction='row' spacing={2}>
          <TextField
            label="Max Value"
            value={shippingSettingsOrDefault.letter.maxValue.toString()}
            onChange={handleUpdateLetterSettings('maxValue')}
            fullWidth
          />
          <TextField
            label="Length (in)"
            value={shippingSettingsOrDefault.letter.length}
            onChange={handleUpdateLetterSettings('length')}
            fullWidth
          />
          <TextField
            label="Width (in)"
            value={shippingSettingsOrDefault.letter.width}
            onChange={handleUpdateLetterSettings('width')}
            fullWidth
          />
          <TextField
            label="Height (in)"
            value={shippingSettingsOrDefault.letter.height}
            onChange={handleUpdateLetterSettings('height')}
            fullWidth
          />
        </Stack>
        <Typography variant="h6">Flat Settings</Typography>
        <Stack direction='row' spacing={2}>
          <FormControl fullWidth>
            <InputLabel id="flat-label-size-label">Label Size</InputLabel>
            <Select
              id="flat-label-size"
              labelId="flat-label-size-label"
              value={shippingSettingsOrDefault.flat.labelSize}
              label="Flat Label Size"
              onChange={handleUpdateFlatSettings('labelSize')}
            >
              <MenuItem value='4x6'>4x6</MenuItem>
              <MenuItem value='7x3'>7x3</MenuItem>
              <MenuItem value='6x4'>6x4</MenuItem>
            </Select>
          </FormControl>
          <TextField
            label="Per Item Weight (oz)"
            value={shippingSettingsOrDefault.flat.perItemWeight}
            onChange={handleUpdateFlatSettings('perItemWeight')}
            fullWidth
          />
          <TextField
            label="Base Weight (oz)"
            value={shippingSettingsOrDefault.flat.baseWeight}
            onChange={handleUpdateFlatSettings('baseWeight')}
            fullWidth
          />
          <TextField
            label="Max Item Count"
            value={shippingSettingsOrDefault.flat.maxItemCount}
            onChange={handleUpdateFlatSettings('maxItemCount')}
            fullWidth
          />
          </Stack>
          <Stack direction='row' spacing={2}>
          <TextField
            label="Max Value"
            value={shippingSettingsOrDefault.flat.maxValue.toString()}
            onChange={handleUpdateFlatSettings('maxValue')}
            fullWidth
          />
          <TextField
            label="Length (in)"
            value={shippingSettingsOrDefault.flat.length}
            onChange={handleUpdateFlatSettings('length')}
            fullWidth
          />
          <TextField
            label="Width (in)"
            value={shippingSettingsOrDefault.flat.width}
            onChange={handleUpdateFlatSettings('width')}
            fullWidth
          />
          <TextField
            label="Height (in)"
            value={shippingSettingsOrDefault.flat.height}
            onChange={handleUpdateFlatSettings('height')}
            fullWidth
          />
        </Stack>
        <Typography variant="h6">Parcel Settings</Typography>
        <Stack direction='row' spacing={2}>
          <FormControl fullWidth>
            <InputLabel id="parcel-label-size-label">Label Size</InputLabel>
            <Select
              id="parcel-label-size"
              labelId="parcel-label-size-label"
              value={shippingSettingsOrDefault.parcel.labelSize}
              label="Parcel Label Size"
              onChange={handleUpdateParcelSettings('labelSize')}
            >
              <MenuItem value='4x6'>4x6</MenuItem>
              <MenuItem value='7x3'>7x3</MenuItem>
              <MenuItem value='6x4'>6x4</MenuItem>
            </Select>
          </FormControl>
          <TextField
            label="Per Item Weight (oz)"
            value={shippingSettingsOrDefault.parcel.perItemWeight}
            onChange={handleUpdateParcelSettings('perItemWeight')}
            fullWidth
          />
          <TextField
            label="Base Weight (oz)"
            value={shippingSettingsOrDefault.parcel.baseWeight}
            onChange={handleUpdateParcelSettings('baseWeight')}
            fullWidth
          />
          </Stack>
          <Stack direction='row' spacing={2}>
          <TextField
            label="Length (in)"
            value={shippingSettingsOrDefault.parcel.length}
            onChange={handleUpdateParcelSettings('length')}
            fullWidth
          />
          <TextField
            label="Width (in)"
            value={shippingSettingsOrDefault.parcel.width}
            onChange={handleUpdateParcelSettings('width')}
            fullWidth
          />
          <TextField
            label="Height (in)"
            value={shippingSettingsOrDefault.parcel.height}
            onChange={handleUpdateParcelSettings('height')}
            fullWidth
          />
        </Stack>
        <Typography variant="h6">Label Settings</Typography>
        <Stack direction='row' spacing={2}>
        <FormControl fullWidth>
            <InputLabel id="label-format-label">Label Format</InputLabel>
            <Select
              id="label-format"
              labelId="label-format-label"
              value={shippingSettingsOrDefault.labelFormat}
              label="Label Format"
              onChange={handleUpdateShippingSettings('labelFormat')}
            >
              <MenuItem value='PDF'>PDF</MenuItem>
              <MenuItem value='PNG'>PNG</MenuItem>
            </Select>
          </FormControl>
        </Stack>
        <Typography variant="h6">TCG Player Shipping Export</Typography>
        <input
          type="file"
          accept=".csv"
          onChange={handleFileInput} />
        <Button onClick={downloadCsv} disabled={!csvOutput} variant='contained'>Download EasyPost CSV(s)</Button>
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Orders</TableCell>
                <TableCell>To Address</TableCell>
                <TableCell>From Address</TableCell>
                <TableCell>Parcel Details</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {shipments.map((shipment) => {
                const order = orders.find(order => order['Order #'] === shipment.reference);
                return (
                  <TableRow key={shipment.reference}>
                    <TableCell>
                      <Typography component="pre">
                        {shipmentToOrderMap?.[shipment.reference]?.join('\n')}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Address {...shipment.to_address} />
                    </TableCell>
                    <TableCell>
                      <Address {...shipment.from_address} />
                    </TableCell>
                    <TableCell>
                      <Typography component="pre">
                        {`Order Total: ${order?.['Value of Products']}\nItem Count: ${order?.['Item Count']}\nSize (in): ${shipment.parcel.length} × ${shipment.parcel.width} × ${shipment.parcel.height}\nWeight (oz): ${shipment.parcel.weight}\nPredefined Package: ${shipment.parcel.predefined_package}\n${shipment.options.delivery_confirmation === 'SIGNATURE' ? 'Signature Required' : 'No Signature Required'}`}
                      </Typography>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </TableContainer>
      </Stack>
    </Container>
  );
}

function Address(address: EasyPostAddress) {
  return (
    <Typography component="pre">
      {`${address.name}`}
      {address.company && `\n${address.company}`}
      {address.street1 && `\n${address.street1}`}
      {address.street2 && `\n${address.street2}`}
      {`\n${address.city}, ${address.state} ${address.zip}`}
    </Typography>
  );
}