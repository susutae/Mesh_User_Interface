import { CONFIG_SECTIONS, TABS } from "../configurationSchema.js";

export function normaliseSearchText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function configSlug(value) {
  const words = String(value || "")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  return words
    .map((word, index) => {
      const normalized =
        word.length > 1 && word === word.toUpperCase()
          ? word.toLowerCase()
          : word.charAt(0).toLowerCase() + word.slice(1);
      return index === 0
        ? normalized
        : normalized.charAt(0).toUpperCase() + normalized.slice(1);
    })
    .join("");
}

function buildConfigurationSearchEntries() {
  return TABS.flatMap((tab) => {
    const sections = CONFIG_SECTIONS[tab.id] || [];
    const tabEntry = {
      id: `${tab.id}:tab`,
      tabId: tab.id,
      tabLabel: tab.label,
      sectionTitle: sections[0]?.title || "",
      type: "Tab",
      label: tab.label,
      description: tab.description,
      text: normaliseSearchText(
        [tab.label, tab.description, tab.id].join(" "),
      ),
    };

    const sectionEntries = sections.flatMap((section) => {
      const sectionText = [
        tab.label,
        tab.description,
        section.title,
        section.fields.map((field) => field.label).join(" "),
        section.fields.map((field) => field.key).join(" "),
      ].join(" ");

      const sectionEntry = {
        id: `${tab.id}:${section.title}:section`,
        tabId: tab.id,
        tabLabel: tab.label,
        sectionTitle: section.title,
        type: "Section",
        label: section.title,
        description: tab.description,
        text: normaliseSearchText(sectionText),
      };

      const fieldEntries = section.fields.map((field) => ({
        id: `${tab.id}:${section.title}:${field.id || field.key}`,
        tabId: tab.id,
        tabLabel: tab.label,
        sectionTitle: section.title,
        type: "Setting",
        label: field.label,
        description: section.title,
        key: field.key,
        text: normaliseSearchText(
          [
            tab.label,
            tab.description,
            section.title,
            field.label,
            field.key,
            field.hint,
            Array.isArray(field.options) ? field.options.join(" ") : "",
          ].join(" "),
        ),
      }));

      return [sectionEntry, ...fieldEntries];
    });

    return [tabEntry, ...sectionEntries];
  });
}

export function scoreConfigurationSearch(entry, query) {
  const label = normaliseSearchText(entry.label);
  const section = normaliseSearchText(entry.sectionTitle);
  const key = normaliseSearchText(entry.key);
  if (label === query || section === query || key === query) return 100;
  if (label.startsWith(query) || section.startsWith(query)) return 85;
  if (key.startsWith(query)) return 78;
  if (label.includes(query)) return 70;
  if (section.includes(query)) return 62;
  if (key.includes(query)) return 58;
  if (entry.text.includes(query)) return 42;
  return 0;
}

export const CONFIGURATION_SEARCH_INDEX = buildConfigurationSearchEntries();
