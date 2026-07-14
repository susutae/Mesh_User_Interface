import ConfigurationControls from "./ConfigurationControls.jsx";
import { DATA_SECTIONS } from "./configurationSchema.js";

export default function DataConfig(props) {
  return <ConfigurationControls activeTab="data" sections={DATA_SECTIONS} {...props} />;
}
