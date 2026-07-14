import ConfigurationControls from "./ConfigurationControls.jsx";
import { SECURITY_SECTIONS } from "./configurationSchema.js";

export default function SecurityConfig(props) {
  return <ConfigurationControls activeTab="security" sections={SECURITY_SECTIONS} {...props} />;
}
