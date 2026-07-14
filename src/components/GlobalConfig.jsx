import ConfigurationControls from "./ConfigurationControls.jsx";
import { CONFIG_SECTIONS, TABS } from "./configurationSchema.js";
import { useI18n } from "../i18n/index.js";

const GLOBAL_CATEGORY_ORDER = ["rf", "network", "data", "audio", "security", "gps"];

function categoryFromSection(section) {
  return section?.sourceTabId || section?.title?.split("/")?.[0]?.trim()?.toLowerCase();
}

export default function GlobalConfig(props) {
  const { t } = useI18n();
  const groupedSections = GLOBAL_CATEGORY_ORDER.map((categoryId) => {
    const tab = TABS.find((item) => item.id === categoryId);
    return {
      id: categoryId,
      label: t(`configuration.${categoryId}`, tab?.label || categoryId),
      description: t(
        `configuration.${categoryId}Description`,
        tab?.description || "",
      ),
      sections: CONFIG_SECTIONS.global.filter(
        (section) => categoryFromSection(section) === categoryId,
      ),
    };
  }).filter((category) => category.sections.length > 0);

  return (
    <div className="configuration-global-groups">
      {groupedSections.map((category) => (
        <section className="configuration-global-group" key={category.id}>
          <ConfigurationControls
            activeTab="global"
            sections={category.sections}
            groupedCard={{
              title: category.label,
              description: category.description,
            }}
            {...props}
          />
        </section>
      ))}
    </div>
  );
}
