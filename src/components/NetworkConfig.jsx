import ConfigurationControls from "./ConfigurationControls.jsx";
import { NETWORK_SECTIONS } from "./configurationSchema.js";

export default function NetworkConfig(props) {
  return <ConfigurationControls activeTab="network" sections={NETWORK_SECTIONS} {...props} />;
}
