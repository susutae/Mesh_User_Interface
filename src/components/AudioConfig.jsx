import ConfigurationControls from "./ConfigurationControls.jsx";
import { AUDIO_SECTIONS } from "./configurationSchema.js";

export default function AudioConfig(props) {
  return <ConfigurationControls activeTab="audio" sections={AUDIO_SECTIONS} {...props} />;
}
