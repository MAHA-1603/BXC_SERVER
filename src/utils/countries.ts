// lib/constants/countries.ts
import { Country } from "@prisma/client";


export const SUPPORTED_COUNTRIES = {
  IN: {
    code: 'IN',
    name: 'India',
    currency: 'INR',
    currencySymbol: '₹',
    taxName: 'GST',
    taxRate: 18.0,
    smallestUnit: 100,
  },
  US: {
    code: 'US',
    name: 'United States',
    currency: 'USD',
    currencySymbol: '$',
    taxName: 'Sales Tax',
    taxRate: 0,
    smallestUnit: 100,
  },
  GB: {
    code: 'GB',
    name: 'United Kingdom',
    currency: 'GBP',
    currencySymbol: '£',
    taxName: 'VAT',
    taxRate: 20.0,
    smallestUnit: 100,
  },
  MY: {
    code: 'MY',
    name: 'Malaysia',
    currency: 'MYR',
    currencySymbol: 'RM',
    taxName: 'SST',
    taxRate: 6.0,
    smallestUnit: 100,
  },
  SG: {
    code: 'SG',
    name: 'Singapore',
    currency: 'SGD',
    currencySymbol: 'S$',
    taxName: 'GST',
    taxRate: 9.0,
    smallestUnit: 100,
  },
  VN: {
    code: 'VN',
    name: 'Vietnam',
    currency: 'VND',
    currencySymbol: '₫',
    taxName: 'VAT',
    taxRate: 10.0,
    smallestUnit: 1,
  },
};

export type CountryCode = keyof typeof SUPPORTED_COUNTRIES;

// Exchange rates FROM INR to other currencies
export const EXCHANGE_RATES = {
  INR: 1,
  USD: 0.012,
  GBP: 0.0095,
  MYR: 0.053,
  SGD: 0.016,
  VND: 300,
};

export const isValidCountryCode = (code: string): code is CountryCode => {
  return code in SUPPORTED_COUNTRIES;
};

export const mapCountryToEnum = (country?: string): Country => {
  if (!country) return Country.INDIA;
  const upper = country.toUpperCase();
  if (upper === "IN" || upper === "INDIA") return Country.INDIA;
  return Country.INTERNATIONAL;
};