import ConfigurationControls from "./ConfigurationControls.jsx";
import { RF_SECTIONS } from "./configurationSchema.js";

export default function RfConfig(props) {
  return <ConfigurationControls activeTab="rf" sections={RF_SECTIONS} {...props} />;
}
