import ConfigurationControls from "./ConfigurationControls.jsx";
import { GPS_SECTIONS } from "./configurationSchema.js";

export default function GpsConfig(props) {
  return <ConfigurationControls activeTab="gps" sections={GPS_SECTIONS} {...props} />;
}
