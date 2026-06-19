import KotaniProvider from "./kotaniProvider.js";
import PartnerProvider from "./partnerProvider.js";

const providers = {
  kotani: KotaniProvider,
  partner: PartnerProvider,
};

import { Secrets } from "../config/secrets.js";

const providerName = Secrets.RAMP_PROVIDER?.toLowerCase() || "kotani";
const selectedProvider = providers[providerName] || KotaniProvider;

export default selectedProvider;