import {
  Link,
  Button,
  Container,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  SelectChangeEvent,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
  IconButton,
  Drawer,
  Tooltip,
} from "@mui/material";
import EditIcon from "@mui/icons-material/Edit";
import ReplyIcon from "@mui/icons-material/Reply";
import DownloadIcon from "@mui/icons-material/Download";
import type { MetaFunction } from "@remix-run/node";
import currency from "currency.js";
import { csv2json, json2csv } from "json-2-csv";
import { useState } from "react";
import {
  EasyPostAddress,
  EasyPostPackageType,
  EasyPostParcel,
  EasyPostService,
  EasyPostShipment,
} from "~/easypost/types";
import { useLocalStorageState } from "~/hooks/useLocalStorageState";
import { TcgPlayerOrder, TcgPlayerShippingMethod } from "~/tcgplayer/types";
import { Link as RemixLink } from "@remix-run/react";
import { normalizeZipCode } from "~/utilities/normalizeZipCode";

type ShipmentToOrderMap = {
  [reference: string]: string[];
};

type ShippingSettings = {
  fromAddress: EasyPostAddress;
  letter: {
    labelSize: "4x6" | "7x3" | "6x4";
    baseWeight: string;
    perItemWeight: string;
    maxItemCount: string;
    maxValue: string;
    length: string;
    width: string;
    height: string;
  };
  flat: {
    labelSize: "4x6" | "7x3" | "6x4";
    baseWeight: string;
    perItemWeight: string;
    maxItemCount: string;
    maxValue: string;
    length: string;
    width: string;
    height: string;
  };
  parcel: {
    labelSize: "4x6" | "7x3" | "6x4";
    baseWeight: string;
    perItemWeight: string;
    length: string;
    width: string;
    height: string;
  };
  labelFormat: "PDF" | "PNG";
};

const csv2jsonOptions = {
  delimiter: {
    field: ",",
  },
};

const json2csvOptions = {
  delimiter: {
    field: ",",
  },
};

const SLEEVED_CARD_OZ = 0.09;
const NO_10_ENVELOPE_OZ = 0.2;
const TEAM_BAG_OZ = 0.03;
const PACKING_SLIP_OZ = 0.08;
const BUBBLE_MAILER_5x7_OZ = 0.3;
const BUBBLE_MAILER_7x9_OZ = 0.45;
const RACK_CARD_OZ = 0.18;
const BINDER_PAGE_OZ = 0.14;
const LETTER_PAPER_OZ = 0.2;

const calculateService = (
  itemCount: number,
  valueOfProducts: number,
  shippingMethod: TcgPlayerShippingMethod,
  settings: ShippingSettings
): EasyPostService => {
  if (shippingMethod.startsWith("Expedited")) return "GroundAdvantage";
  if (valueOfProducts >= Number(settings.flat.maxValue))
    return "GroundAdvantage";
  if (itemCount > Number(settings.flat.maxItemCount)) return "GroundAdvantage";
  return "First";
};

const calculatePackageType = (
  itemCount: number,
  valueOfProducts: number,
  shippingMethod: TcgPlayerShippingMethod,
  settings: ShippingSettings
): EasyPostPackageType => {
  if (itemCount > Number(settings.flat.maxItemCount)) return "Parcel";
  if (shippingMethod.startsWith("Expedited")) return "Parcel";
  if (valueOfProducts >= Number(settings.flat.maxValue)) return "Parcel";
  if (itemCount > Number(settings.letter.maxItemCount)) return "Flat";
  return "Letter";
};

const getDeliveryConfirmation = (valueOfProducts: currency) => {
  if (valueOfProducts.value >= currency(250).value) return "SIGNATURE";
  else return "NO_SIGNATURE";
};

const downloadCsv = (filename: string, shipments: EasyPostShipment[]) => {
  const csvData = json2csv(shipments, json2csvOptions);
  const blob = new Blob([csvData], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${filename}_${new Date()
    .toISOString()
    .replace(/[:T-]/g, ".")}.csv`;
  link.click();
};

const downloadCsvByLabelSize = (
  labelSize: string,
  shipments: EasyPostShipment[]
) => {
  const filteredShipments = shipments.filter(
    (shipment) => shipment.options.label_size === labelSize
  );
  downloadCsv(`EasyPost_Shipments_${labelSize}`, filteredShipments);
};

const downloadReturnCsvByLabelSize = (
  labelSize: string,
  shipments: EasyPostShipment[]
) => {
  const filteredShipments = shipments.filter(
    (shipment) => shipment.options.label_size === labelSize
  );
  downloadCsv(`EasyPost_Returns_${labelSize}`, filteredShipments);
};

const mergeOrdersByAddress = (
  orders: TcgPlayerOrder[]
): [TcgPlayerOrder[], ShipmentToOrderMap] => {
  const shipmentToOrderMap: ShipmentToOrderMap = {};
  const processedOrderNumbers = new Set<string>();
  const mergedOrders = orders.reduce(
    (acc: { [key: string]: TcgPlayerOrder }, order) => {
      if (
        order["Order #"] === "" ||
        processedOrderNumbers.has(order["Order #"])
      )
        return acc;

      const addressKey = `${order.Address1}-${order.Address2}-${order.City}-${order.State}-${order.PostalCode}`;

      if (!acc[addressKey]) {
        acc[addressKey] = { ...order };
        shipmentToOrderMap[order["Order #"]] = [order["Order #"]];
      } else {
        shipmentToOrderMap[acc[addressKey]["Order #"]] = [
          ...shipmentToOrderMap[acc[addressKey]["Order #"]],
          order["Order #"],
        ];
        acc[addressKey]["Item Count"] += order["Item Count"];
        acc[addressKey]["Value Of Products"] = currency(
          acc[addressKey]["Value Of Products"]
        ).add(order["Value Of Products"]).value;
        if (order["Shipping Method"].startsWith("Expedited")) {
          acc[addressKey]["Shipping Method"] = order["Shipping Method"];
        }
      }

      processedOrderNumbers.add(order["Order #"]);
      return acc;
    },
    {}
  );
  return [Object.values(mergedOrders), shipmentToOrderMap];
};

const mapOrderToAddress = (order: TcgPlayerOrder): EasyPostAddress => {
  return {
    name: `${order.FirstName} ${order.LastName}`,
    street1: order.Address1,
    street2: order.Address2,
    city: order.City,
    state: order.State,
    zip: normalizeZipCode(order.PostalCode),
    country: order.Country,
  };
};

function mapOrderToShipment(
  order: TcgPlayerOrder,
  settings: ShippingSettings
): EasyPostShipment {
  const toAddress: EasyPostAddress = mapOrderToAddress(order);

  const itemCount = order["Item Count"];
  const valueOfProducts = currency(order["Value Of Products"]);
  const shippingMethod = order["Shipping Method"];

  const service = calculateService(
    itemCount,
    valueOfProducts.value,
    shippingMethod,
    settings
  );

  const parcelType = calculatePackageType(
    itemCount,
    valueOfProducts.value,
    shippingMethod,
    settings
  );

  const parcel: EasyPostParcel =
    service === "First" && parcelType === "Letter"
      ? {
          length: Number(settings.letter.length),
          width: Number(settings.letter.width),
          height: Number(settings.letter.height),
          weight:
            Math.ceil(
              (Number(settings.letter.baseWeight) +
                itemCount * Number(settings.letter.perItemWeight)) *
                100
            ) / 100,
          predefined_package: "Letter",
        }
      : service === "First" && parcelType === "Flat"
      ? {
          length: Number(settings.flat.length),
          width: Number(settings.flat.width),
          height: Number(settings.flat.height),
          weight:
            Math.ceil(
              (Number(settings.flat.baseWeight) +
                itemCount * Number(settings.flat.perItemWeight)) *
                100
            ) / 100,
          predefined_package: "Flat",
        }
      : {
          length: Number(settings.parcel.length),
          width: Number(settings.parcel.width),
          height: Number(settings.parcel.height),
          weight:
            Math.ceil(
              (Number(settings.parcel.baseWeight) +
                itemCount * Number(settings.parcel.perItemWeight)) *
                100
            ) / 100,
          predefined_package: "Parcel",
        };

  const labelSize =
    parcelType === "Letter"
      ? settings.letter.labelSize
      : parcelType === "Flat"
      ? settings.flat.labelSize
      : settings.parcel.labelSize;

  const shipment: EasyPostShipment = {
    reference: order["Order #"],
    to_address: toAddress,
    from_address: settings.fromAddress,
    return_address: settings.fromAddress,
    parcel: parcel,
    carrier: "USPS",
    service: service,
    options: {
      label_format: settings.labelFormat,
      label_size: labelSize,
      invoice_number: order["Order #"],
      delivery_confirmation: getDeliveryConfirmation(valueOfProducts),
    },
  };

  return shipment;
}

function mapTcgPlayerOrdersToEasyPostShipments(
  tcgPlayerOrders: TcgPlayerOrder[],
  settings: ShippingSettings
): EasyPostShipment[] {
  return tcgPlayerOrders.map((order) => mapOrderToShipment(order, settings));
}

export const meta: MetaFunction = () => {
  return [
    { title: "TCG Player EasyPost Tool" },
    { name: "description", content: "TCG Player EasyPost Tool" },
  ];
};

const defaultAddress = {
  name: "",
  street1: "",
  city: "",
  state: "",
  zip: "",
  country: "US",
};

const defaultPerItemWeight = SLEEVED_CARD_OZ;
const defaultLetterBaseWeight =
  NO_10_ENVELOPE_OZ + RACK_CARD_OZ + BINDER_PAGE_OZ + PACKING_SLIP_OZ;
const defaultFlatBaseWeight =
  BUBBLE_MAILER_5x7_OZ + TEAM_BAG_OZ * 2 + PACKING_SLIP_OZ;
const defaultParcelBaseWeight =
  BUBBLE_MAILER_7x9_OZ + TEAM_BAG_OZ * 4 + LETTER_PAPER_OZ + PACKING_SLIP_OZ;
const defaultMaxLetterItemCount = 24;
const defaultMaxFlatItemCount = 100;
const defaultMaxLetterValue = 50;
const defaultMaxFlatValue = 50;

const defaultShippingSettings: ShippingSettings = {
  fromAddress: defaultAddress,
  letter: {
    labelSize: "7x3",
    baseWeight: defaultLetterBaseWeight.toString(),
    maxItemCount: defaultMaxLetterItemCount.toString(),
    maxValue: defaultMaxLetterValue.toString(),
    length: "9.5",
    width: "4.125",
    height: "0.25",
    perItemWeight: defaultPerItemWeight.toString(),
  },
  flat: {
    labelSize: "4x6",
    baseWeight: defaultFlatBaseWeight.toString(),
    maxItemCount: defaultMaxFlatItemCount.toString(),
    maxValue: defaultMaxFlatValue.toString(),
    length: "5",
    width: "7",
    height: "0.75",
    perItemWeight: defaultPerItemWeight.toString(),
  },
  parcel: {
    labelSize: "4x6",
    baseWeight: defaultParcelBaseWeight.toString(),
    length: "7",
    width: "9",
    height: "0.75",
    perItemWeight: defaultPerItemWeight.toString(),
  },
  labelFormat: "PDF",
};

export default function Index() {
  const [csvOutput, setCsvOutput] = useState("");
  const [orders, setOrders] = useState<TcgPlayerOrder[]>([]);
  const [shipments, setShipments] = useState<EasyPostShipment[]>([]);
  const [shipmentToOrderMap, setShipmentToOrderMap] =
    useState<ShipmentToOrderMap>({});
  const [shippingSettings, setShippingSettings] =
    useLocalStorageState<ShippingSettings>(
      "shippingSettings",
      defaultShippingSettings
    );

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedShipment, setSelectedShipment] =
    useState<EasyPostShipment | null>(null);

  const handleEditClick = (shipment: EasyPostShipment) => {
    setSelectedShipment(shipment);
    setDrawerOpen(true);
  };

  const handleDrawerClose = () => {
    setDrawerOpen(false);
    setSelectedShipment(null);
  };

  const handleShipmentChange = (changes: Partial<EasyPostShipment>) => {
    if (selectedShipment) {
      setSelectedShipment({ ...selectedShipment, ...changes });
    }
  };

  const saveShipmentChanges = () => {
    if (selectedShipment) {
      setShipments((prevShipments) =>
        prevShipments.map((shipment) =>
          shipment.reference === selectedShipment.reference
            ? selectedShipment
            : shipment
        )
      );
      setDrawerOpen(false);
    }
  };

  const shippingSettingsOrDefault = shippingSettings ?? defaultShippingSettings;

  const handleFileInput = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files![0];
    const reader = new FileReader();

    reader.onload = (event) => {
      if (shippingSettingsOrDefault.fromAddress === undefined) return;
      const csvInput = event.target!.result as string;
      var orders: TcgPlayerOrder[] = csv2json(
        csvInput,
        csv2jsonOptions
      ) as TcgPlayerOrder[];
      const [mergedOrders, shipmentToOrderMap] = mergeOrdersByAddress(orders);
      setOrders(mergedOrders);
      setShipmentToOrderMap(shipmentToOrderMap);
      var easyPostShipments = mapTcgPlayerOrdersToEasyPostShipments(
        mergedOrders,
        shippingSettingsOrDefault
      );
      setCsvOutput(json2csv(easyPostShipments));
      setShipments(easyPostShipments);
    };

    reader.readAsText(file);
  };

  const downloadCsv = () => {
    const labelSizes = ["4x6", "7x3", "6x4"] as const;
    for (const labelSize of labelSizes) {
      const shipmentsByLabelSize = shipments.filter(
        (shipment) => shipment.options.label_size === labelSize
      );
      if (shipmentsByLabelSize.length > 0) {
        downloadCsvByLabelSize(labelSize, shipmentsByLabelSize);
      }
    }
  };

  const handleDownloadCSV = (shipment: EasyPostShipment) => {
    downloadCsvByLabelSize(shipment.options.label_size, [shipment]);
  };

  const handleDownloadReturnCSV = (shipment: EasyPostShipment) => {
    const returnShipment = {
      ...shipment,
      to_address: shipment.from_address,
      from_address: shipment.to_address,
    };
    downloadReturnCsvByLabelSize(returnShipment.options.label_size, [
      returnShipment,
    ]);
  };

  const handleUpdateShippingSettings =
    (key: keyof ShippingSettings) =>
    (
      e:
        | React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
        | SelectChangeEvent<string>
    ) => {
      setShippingSettings({
        ...shippingSettingsOrDefault,
        [key]: e.target.value,
      });
    };

  const handleUpdateFromAddress =
    (key: keyof EasyPostAddress) =>
    (
      e:
        | React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
        | SelectChangeEvent<string>
    ) => {
      setShippingSettings({
        ...shippingSettingsOrDefault,
        fromAddress: {
          ...shippingSettingsOrDefault.fromAddress,
          [key]: e.target.value,
        },
      });
    };

  const handleUpdateLetterSettings =
    (key: keyof ShippingSettings["letter"]) =>
    (
      e:
        | React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
        | SelectChangeEvent<string>
    ) => {
      setShippingSettings({
        ...shippingSettingsOrDefault,
        letter: { ...shippingSettingsOrDefault.letter, [key]: e.target.value },
      });
    };

  const handleUpdateFlatSettings =
    (key: keyof ShippingSettings["flat"]) =>
    (
      e:
        | React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
        | SelectChangeEvent<string>
    ) => {
      setShippingSettings({
        ...shippingSettingsOrDefault,
        flat: { ...shippingSettingsOrDefault.flat, [key]: e.target.value },
      });
    };

  const handleUpdateParcelSettings =
    (key: keyof ShippingSettings["parcel"]) =>
    (
      e:
        | React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
        | SelectChangeEvent<string>
    ) => {
      setShippingSettings({
        ...shippingSettingsOrDefault,
        parcel: { ...shippingSettingsOrDefault.parcel, [key]: e.target.value },
      });
    };

  const handleResetSettings = () => {
    setShippingSettings(defaultShippingSettings);
  };

  return (
    <>
      <Container>
        <Stack spacing={2} margin={2}>
          <Link component={RemixLink} to="/how-to-use">
            How To Use
          </Link>
          <Stack direction="row" spacing={2}>
            <Typography variant="h6">From Address</Typography>
            <Button
              onClick={handleResetSettings}
              variant="outlined"
              color="inherit"
            >
              Reset Settings
            </Button>
          </Stack>
          <Stack direction="row" spacing={2}>
            <TextField
              label="Sender"
              value={shippingSettingsOrDefault.fromAddress.name}
              fullWidth
              onChange={handleUpdateFromAddress("name")}
            />
            <TextField
              label="Company (Optional)"
              value={shippingSettingsOrDefault.fromAddress.company ?? ""}
              onChange={handleUpdateFromAddress("company")}
              fullWidth
            />
          </Stack>
          <Stack direction="row" spacing={2}>
            <TextField
              label="Phone (Optional)"
              value={shippingSettingsOrDefault.fromAddress.phone ?? ""}
              onChange={handleUpdateFromAddress("phone")}
              fullWidth
            />
            <TextField
              label="Email (Optional)"
              value={shippingSettingsOrDefault.fromAddress.email ?? ""}
              onChange={handleUpdateFromAddress("email")}
              fullWidth
            />
          </Stack>
          <Stack direction="row" spacing={2}>
            <TextField
              label="Street 1"
              value={shippingSettingsOrDefault.fromAddress.street1}
              onChange={handleUpdateFromAddress("street1")}
              fullWidth
            />
          </Stack>
          <Stack direction="row" spacing={2}>
            <TextField
              label="Street 2 (Optional)"
              value={shippingSettingsOrDefault.fromAddress.street2}
              onChange={handleUpdateFromAddress("street2")}
              fullWidth
            />
          </Stack>
          <Stack direction="row" spacing={2}>
            <TextField
              label="City"
              value={shippingSettingsOrDefault.fromAddress.city}
              onChange={handleUpdateFromAddress("city")}
              fullWidth
            />
            <TextField
              label="State"
              value={shippingSettingsOrDefault.fromAddress.state}
              onChange={handleUpdateFromAddress("state")}
              fullWidth
            />
            <TextField
              label="Zip"
              value={shippingSettingsOrDefault.fromAddress.zip}
              onChange={handleUpdateFromAddress("zip")}
              fullWidth
            />
            <TextField
              label="Country"
              value={shippingSettingsOrDefault.fromAddress.country}
              onChange={handleUpdateFromAddress("country")}
              fullWidth
            />
          </Stack>
          <Typography variant="h6">Letter Settings</Typography>
          <Stack direction="row" spacing={2}>
            <FormControl fullWidth>
              <InputLabel id="letter-label-size-label">Label Size</InputLabel>
              <Select
                id="letter-label-size"
                labelId="letter-label-size-label"
                value={shippingSettingsOrDefault.letter.labelSize}
                label="Letter Label Size"
                onChange={handleUpdateLetterSettings("labelSize")}
              >
                <MenuItem value="4x6">4x6</MenuItem>
                <MenuItem value="7x3">7x3</MenuItem>
                <MenuItem value="6x4">6x4</MenuItem>
              </Select>
            </FormControl>
            <TextField
              label="Per Item Weight (oz)"
              type="number"
              value={shippingSettingsOrDefault.letter.perItemWeight}
              onChange={handleUpdateLetterSettings("perItemWeight")}
              fullWidth
            />
            <TextField
              label="Base Weight (oz)"
              type="number"
              value={shippingSettingsOrDefault.letter.baseWeight}
              onChange={handleUpdateLetterSettings("baseWeight")}
              fullWidth
            />
            <TextField
              label="Max Item Count"
              type="number"
              value={shippingSettingsOrDefault.letter.maxItemCount}
              onChange={handleUpdateLetterSettings("maxItemCount")}
              fullWidth
            />
          </Stack>
          <Stack direction="row" spacing={2}>
            <TextField
              label="Max Value"
              type="number"
              value={shippingSettingsOrDefault.letter.maxValue.toString()}
              onChange={handleUpdateLetterSettings("maxValue")}
              fullWidth
            />
            <TextField
              label="Length (in)"
              type="number"
              value={shippingSettingsOrDefault.letter.length}
              onChange={handleUpdateLetterSettings("length")}
              fullWidth
            />
            <TextField
              label="Width (in)"
              type="number"
              value={shippingSettingsOrDefault.letter.width}
              onChange={handleUpdateLetterSettings("width")}
              fullWidth
            />
            <TextField
              label="Height (in)"
              type="number"
              value={shippingSettingsOrDefault.letter.height}
              onChange={handleUpdateLetterSettings("height")}
              fullWidth
            />
          </Stack>
          <Typography variant="h6">Flat Settings</Typography>
          <Stack direction="row" spacing={2}>
            <FormControl fullWidth>
              <InputLabel id="flat-label-size-label">Label Size</InputLabel>
              <Select
                id="flat-label-size"
                labelId="flat-label-size-label"
                value={shippingSettingsOrDefault.flat.labelSize}
                label="Flat Label Size"
                onChange={handleUpdateFlatSettings("labelSize")}
              >
                <MenuItem value="4x6">4x6</MenuItem>
                <MenuItem value="7x3">7x3</MenuItem>
                <MenuItem value="6x4">6x4</MenuItem>
              </Select>
            </FormControl>
            <TextField
              label="Per Item Weight (oz)"
              type="number"
              value={shippingSettingsOrDefault.flat.perItemWeight}
              onChange={handleUpdateFlatSettings("perItemWeight")}
              fullWidth
            />
            <TextField
              label="Base Weight (oz)"
              type="number"
              value={shippingSettingsOrDefault.flat.baseWeight}
              onChange={handleUpdateFlatSettings("baseWeight")}
              fullWidth
            />
            <TextField
              label="Max Item Count"
              type="number"
              value={shippingSettingsOrDefault.flat.maxItemCount}
              onChange={handleUpdateFlatSettings("maxItemCount")}
              fullWidth
            />
          </Stack>
          <Stack direction="row" spacing={2}>
            <TextField
              label="Max Value"
              type="number"
              value={shippingSettingsOrDefault.flat.maxValue.toString()}
              onChange={handleUpdateFlatSettings("maxValue")}
              fullWidth
            />
            <TextField
              label="Length (in)"
              type="number"
              value={shippingSettingsOrDefault.flat.length}
              onChange={handleUpdateFlatSettings("length")}
              fullWidth
            />
            <TextField
              label="Width (in)"
              type="number"
              value={shippingSettingsOrDefault.flat.width}
              onChange={handleUpdateFlatSettings("width")}
              fullWidth
            />
            <TextField
              label="Height (in)"
              type="number"
              value={shippingSettingsOrDefault.flat.height}
              onChange={handleUpdateFlatSettings("height")}
              fullWidth
            />
          </Stack>
          <Typography variant="h6">Parcel Settings</Typography>
          <Stack direction="row" spacing={2}>
            <FormControl fullWidth>
              <InputLabel id="parcel-label-size-label">Label Size</InputLabel>
              <Select
                id="parcel-label-size"
                labelId="parcel-label-size-label"
                value={shippingSettingsOrDefault.parcel.labelSize}
                label="Parcel Label Size"
                onChange={handleUpdateParcelSettings("labelSize")}
              >
                <MenuItem value="4x6">4x6</MenuItem>
                <MenuItem value="7x3">7x3</MenuItem>
                <MenuItem value="6x4">6x4</MenuItem>
              </Select>
            </FormControl>
            <TextField
              label="Per Item Weight (oz)"
              type="number"
              value={shippingSettingsOrDefault.parcel.perItemWeight}
              onChange={handleUpdateParcelSettings("perItemWeight")}
              fullWidth
            />
            <TextField
              label="Base Weight (oz)"
              type="number"
              value={shippingSettingsOrDefault.parcel.baseWeight}
              onChange={handleUpdateParcelSettings("baseWeight")}
              fullWidth
            />
          </Stack>
          <Stack direction="row" spacing={2}>
            <TextField
              label="Length (in)"
              type="number"
              value={shippingSettingsOrDefault.parcel.length}
              onChange={handleUpdateParcelSettings("length")}
              fullWidth
            />
            <TextField
              label="Width (in)"
              type="number"
              value={shippingSettingsOrDefault.parcel.width}
              onChange={handleUpdateParcelSettings("width")}
              fullWidth
            />
            <TextField
              label="Height (in)"
              type="number"
              value={shippingSettingsOrDefault.parcel.height}
              onChange={handleUpdateParcelSettings("height")}
              fullWidth
            />
          </Stack>
          <Typography variant="h6">Label Settings</Typography>
          <Stack direction="row" spacing={2}>
            <FormControl fullWidth>
              <InputLabel id="label-format-label">Label Format</InputLabel>
              <Select
                id="label-format"
                labelId="label-format-label"
                value={shippingSettingsOrDefault.labelFormat}
                label="Label Format"
                onChange={handleUpdateShippingSettings("labelFormat")}
              >
                <MenuItem value="PDF">PDF</MenuItem>
                <MenuItem value="PNG">PNG</MenuItem>
              </Select>
            </FormControl>
          </Stack>
          <Typography variant="h6">TCG Player Shipping Export</Typography>
          <Stack direction="row" spacing={2}>
            <Button variant="contained" component="label">
              Upload TCGPLAYER Shipping Export File
              <input
                type="file"
                accept=".csv"
                hidden
                onChange={handleFileInput}
              />
            </Button>
            <Button
              onClick={downloadCsv}
              disabled={!csvOutput}
              variant="contained"
            >
              Download EasyPost Batch File(s)
            </Button>
          </Stack>
        </Stack>
      </Container>
      <TableContainer>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Orders</TableCell>
              <TableCell>To Address</TableCell>
              <TableCell>From Address</TableCell>
              <TableCell>Parcel Details</TableCell>
              <TableCell>Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {shipments.map((shipment) => {
              const order = orders.find(
                (order) => order["Order #"] === shipment.reference
              );
              return (
                <TableRow key={shipment.reference}>
                  <TableCell>
                    <Typography component="pre">
                      {shipmentToOrderMap?.[shipment.reference]?.join("\n")}
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
                      {`Order Total: ${
                        order?.["Value Of Products"]
                      }\nItem Count: ${order?.["Item Count"]}\nSize (in): ${
                        shipment.parcel.length
                      } × ${shipment.parcel.width} × ${
                        shipment.parcel.height
                      }\nWeight (oz): ${
                        shipment.parcel.weight
                      }\nPredefined Package: ${
                        shipment.parcel.predefined_package
                      }\n${
                        shipment.options.delivery_confirmation === "SIGNATURE"
                          ? "Signature Required"
                          : "No Signature Required"
                      }`}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Tooltip title="Edit Shipment" arrow>
                      <IconButton
                        onClick={() => handleEditClick(shipment)}
                        color="primary"
                        aria-label="Edit Shipment"
                      >
                        <EditIcon />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Download Easypost Shipment File" arrow>
                      <IconButton
                        onClick={() => handleDownloadCSV(shipment)}
                        color="primary"
                        aria-label="Download Easypost Shipment File"
                      >
                        <DownloadIcon />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Download Easypost Return File" arrow>
                      <IconButton
                        onClick={() => handleDownloadReturnCSV(shipment)}
                        color="primary"
                        aria-label="Download Easypost Return File"
                      >
                        <ReplyIcon />
                      </IconButton>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>
      <Drawer anchor="right" open={drawerOpen} onClose={handleDrawerClose}>
        <Container sx={{ width: 400, padding: 2 }}>
          {selectedShipment && (
            <Stack spacing={2}>
              <Typography variant="h6">To Address</Typography>
              <TextField
                label="Name"
                value={selectedShipment.to_address.name}
                onChange={(e) =>
                  handleShipmentChange({
                    to_address: {
                      ...selectedShipment.to_address,
                      name: e.target.value,
                    },
                  })
                }
                fullWidth
              />
              <TextField
                label="Street 1"
                value={selectedShipment.to_address.street1}
                onChange={(e) =>
                  handleShipmentChange({
                    to_address: {
                      ...selectedShipment.to_address,
                      street1: e.target.value,
                    },
                  })
                }
                fullWidth
              />
              <TextField
                label="Street 2"
                value={selectedShipment.to_address.street2}
                onChange={(e) =>
                  handleShipmentChange({
                    to_address: {
                      ...selectedShipment.to_address,
                      street2: e.target.value,
                    },
                  })
                }
                fullWidth
              />
              <TextField
                label="City"
                value={selectedShipment.to_address.city}
                onChange={(e) =>
                  handleShipmentChange({
                    to_address: {
                      ...selectedShipment.to_address,
                      city: e.target.value,
                    },
                  })
                }
                fullWidth
              />
              <TextField
                label="State"
                value={selectedShipment.to_address.state}
                onChange={(e) =>
                  handleShipmentChange({
                    to_address: {
                      ...selectedShipment.to_address,
                      state: e.target.value,
                    },
                  })
                }
                fullWidth
              />
              <TextField
                label="Zip"
                value={selectedShipment.to_address.zip}
                onChange={(e) =>
                  handleShipmentChange({
                    to_address: {
                      ...selectedShipment.to_address,
                      zip: e.target.value,
                    },
                  })
                }
                fullWidth
              />
              <Typography variant="h6">From Address</Typography>
              <TextField
                label="Name"
                value={selectedShipment.from_address.name}
                onChange={(e) =>
                  handleShipmentChange({
                    from_address: {
                      ...selectedShipment.from_address,
                      name: e.target.value,
                    },
                  })
                }
                fullWidth
              />
              <TextField
                label="Street 1"
                value={selectedShipment.from_address.street1}
                onChange={(e) =>
                  handleShipmentChange({
                    from_address: {
                      ...selectedShipment.from_address,
                      street1: e.target.value,
                    },
                  })
                }
                fullWidth
              />
              <TextField
                label="Street 2"
                value={selectedShipment.from_address.street2}
                onChange={(e) =>
                  handleShipmentChange({
                    from_address: {
                      ...selectedShipment.from_address,
                      street2: e.target.value,
                    },
                  })
                }
                fullWidth
              />
              <TextField
                label="City"
                value={selectedShipment.from_address.city}
                onChange={(e) =>
                  handleShipmentChange({
                    from_address: {
                      ...selectedShipment.from_address,
                      city: e.target.value,
                    },
                  })
                }
                fullWidth
              />
              <TextField
                label="State"
                value={selectedShipment.from_address.state}
                onChange={(e) =>
                  handleShipmentChange({
                    from_address: {
                      ...selectedShipment.from_address,
                      state: e.target.value,
                    },
                  })
                }
                fullWidth
              />
              <TextField
                label="Zip"
                value={selectedShipment.from_address.zip}
                onChange={(e) =>
                  handleShipmentChange({
                    from_address: {
                      ...selectedShipment.from_address,
                      zip: e.target.value,
                    },
                  })
                }
                fullWidth
              />
              <Typography variant="h6">Edit Shipment</Typography>
              <TextField
                label="Reference"
                value={selectedShipment.reference}
                onChange={(e) =>
                  handleShipmentChange({ reference: e.target.value })
                }
                fullWidth
              />
              <FormControl fullWidth>
                <InputLabel id="carrier-label">Carrier</InputLabel>
                <Select
                  labelId="carrier-label"
                  label="Carrier"
                  value={selectedShipment.carrier}
                  onChange={(e) =>
                    handleShipmentChange({
                      carrier: e.target.value as "USPS",
                    })
                  }
                >
                  <MenuItem value="USPS">USPS</MenuItem>
                </Select>
              </FormControl>
              <FormControl fullWidth>
                <InputLabel id="service-label">Service</InputLabel>
                <Select
                  labelId="service-label"
                  label="Service"
                  value={selectedShipment.service}
                  onChange={(e) => {
                    const newService = e.target.value as EasyPostService;
                    const updatedParcel =
                      newService === "First"
                        ? {
                            ...selectedShipment.parcel,
                            predefined_package: "Letter",
                          }
                        : {
                            ...selectedShipment.parcel,
                            predefined_package: "Parcel",
                          };
                    handleShipmentChange({
                      service: newService,
                      parcel: updatedParcel as EasyPostParcel,
                    });
                  }}
                >
                  <MenuItem value="First">First</MenuItem>
                  <MenuItem value="GroundAdvantage">Ground Advantage</MenuItem>
                </Select>
              </FormControl>
              <Typography variant="h6">Parcel Details</Typography>
              <TextField
                label="Length (in)"
                type="number"
                value={selectedShipment.parcel.length}
                onChange={(e) =>
                  handleShipmentChange({
                    parcel: {
                      ...selectedShipment.parcel,
                      length: Number(e.target.value),
                    },
                  })
                }
                fullWidth
              />
              <TextField
                label="Width (in)"
                type="number"
                value={selectedShipment.parcel.width}
                onChange={(e) =>
                  handleShipmentChange({
                    parcel: {
                      ...selectedShipment.parcel,
                      width: Number(e.target.value),
                    },
                  })
                }
                fullWidth
              />
              <TextField
                label="Height (in)"
                type="number"
                value={selectedShipment.parcel.height}
                onChange={(e) =>
                  handleShipmentChange({
                    parcel: {
                      ...selectedShipment.parcel,
                      height: Number(e.target.value),
                    },
                  })
                }
                fullWidth
              />
              <TextField
                label="Weight (oz)"
                type="number"
                value={selectedShipment.parcel.weight}
                onChange={(e) =>
                  handleShipmentChange({
                    parcel: {
                      ...selectedShipment.parcel,
                      weight: Number(e.target.value),
                    },
                  })
                }
                fullWidth
              />
              <FormControl fullWidth>
                <InputLabel id="predefined-package-label">
                  Predefined Package
                </InputLabel>
                <Select
                  labelId="predefined-package-label"
                  label="Predefined Package"
                  value={selectedShipment.parcel.predefined_package}
                  onChange={(e) =>
                    handleShipmentChange({
                      parcel: {
                        ...selectedShipment.parcel,
                        predefined_package: e.target
                          .value as EasyPostPackageType,
                      },
                    })
                  }
                >
                  <MenuItem
                    disabled={selectedShipment.service !== "First"}
                    value="Letter"
                  >
                    Letter
                  </MenuItem>
                  <MenuItem
                    disabled={selectedShipment.service !== "First"}
                    value="Flat"
                  >
                    Flat
                  </MenuItem>
                  <MenuItem
                    disabled={selectedShipment.service === "First"}
                    value="Parcel"
                  >
                    Parcel
                  </MenuItem>
                </Select>
              </FormControl>
              <Typography variant="h6">Options</Typography>
              <FormControl fullWidth>
                <InputLabel id="label-format-label">Label Format</InputLabel>
                <Select
                  labelId="label-format-label"
                  label="Label Format"
                  value={selectedShipment.options.label_format}
                  onChange={(e) =>
                    handleShipmentChange({
                      options: {
                        ...selectedShipment.options,
                        label_format: e.target.value as "PNG" | "PDF",
                      },
                    })
                  }
                >
                  <MenuItem value="PNG">PNG</MenuItem>
                  <MenuItem value="PDF">PDF</MenuItem>
                </Select>
              </FormControl>
              <FormControl fullWidth>
                <InputLabel id="label-size-label">Label Size</InputLabel>
                <Select
                  labelId="label-size-label"
                  label="Label Size"
                  value={selectedShipment.options.label_size}
                  onChange={(e) =>
                    handleShipmentChange({
                      options: {
                        ...selectedShipment.options,
                        label_size: e.target.value as "4x6" | "7x3" | "6x4",
                      },
                    })
                  }
                >
                  <MenuItem value="4x6">4x6</MenuItem>
                  <MenuItem value="7x3">7x3</MenuItem>
                  <MenuItem value="6x4">6x4</MenuItem>
                </Select>
              </FormControl>
              <TextField
                label="Invoice Number"
                value={selectedShipment.options.invoice_number}
                onChange={(e) =>
                  handleShipmentChange({
                    options: {
                      ...selectedShipment.options,
                      invoice_number: e.target.value,
                    },
                  })
                }
                fullWidth
              />
              <FormControl fullWidth>
                <InputLabel id="delivery-confirmation-label">
                  Delivery Confirmation
                </InputLabel>
                <Select
                  labelId="delivery-confirmation-label"
                  label="Delivery Confirmation"
                  value={selectedShipment.options.delivery_confirmation}
                  onChange={(e) =>
                    handleShipmentChange({
                      options: {
                        ...selectedShipment.options,
                        delivery_confirmation: e.target.value as
                          | "NO_SIGNATURE"
                          | "SIGNATURE",
                      },
                    })
                  }
                >
                  <MenuItem value="NO_SIGNATURE">No Signature</MenuItem>
                  <MenuItem value="SIGNATURE">Signature</MenuItem>
                </Select>
              </FormControl>
              <Button
                variant="contained"
                color="primary"
                onClick={saveShipmentChanges}
              >
                Save
              </Button>
            </Stack>
          )}
        </Container>
      </Drawer>
    </>
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
