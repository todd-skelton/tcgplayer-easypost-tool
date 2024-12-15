export function normalizeZipCode(zipCode: string | number): string {
  // Convert input to a string
  let zipStr = typeof zipCode === "number" ? zipCode.toString() : zipCode;

  // Remove all non-numeric characters except a dash
  zipStr = zipStr.replace(/[^0-9-]/g, "");

  // Handle 9-digit format with or without a dash
  if (zipStr.includes("-")) {
    // Remove the dash and handle as a plain numeric ZIP code
    zipStr = zipStr.replace("-", "");
  }

  // Add leading zeros if necessary
  if (zipStr.length < 5) {
    zipStr = zipStr.padStart(5, "0");
  }
  if (zipStr.length < 9) {
    zipStr = zipStr.padEnd(9, "0"); // Pad the remaining digits with zeros to make it 9 digits
  }

  // Ensure the output is always in the format "XXXXX-YYYY"
  if (zipStr.length === 9) {
    return `${zipStr.slice(0, 5)}-${zipStr.slice(5)}`;
  } else {
    throw new Error("Invalid ZIP code format");
  }
}
