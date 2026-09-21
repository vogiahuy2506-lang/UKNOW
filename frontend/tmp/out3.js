import { useEffect, useState } from "react";
import EmailSettings from "./EmailSettings";
import ZaloSettings from "./ZaloSettings";
import WhatsAppSettings from "./WhatsAppSettings";
import TelegramSettings from "./TelegramSettings";
import FacebookSettings from "./FacebookSettings";
const TABS = [
  { key: "email", label: "Email" },
  { key: "facebook", label: "Facebook" },
  { key: "zalo", label: "Zalo" },
  { key: "whatsapp", label: "WhatsApp" },
  { key: "telegram", label: "Telegram" }
];
const ChannelSettings = () => {
  const [active, setActive] = useState(() => {
    if (typeof window !== "undefined" && window.location.hash) {
      const tab = window.location.hash.replace(/^#/, "");
      if (TABS.some((t) => t.key === tab)) return tab;
    }
    return "email";
  });
  useEffect(() => {
    if (typeof window === "undefined") return void 0;
    const onHashChange = () => {
      const tab = window.location.hash.replace(/^#/, "");
      if (TABS.some((t) => t.key === tab)) {
        setActive(tab);
      }
    };
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);
  return /* @__PURE__ */ React.createElement("div", { className: "space-y-6" }, /* @__PURE__ */ React.createElement("div", { className: "flex gap-1 p-1 bg-gray-100 rounded-lg w-fit" }, TABS.map(({ key, label }) => /* @__PURE__ */ React.createElement(
    "button",
    {
      key,
      type: "button",
      onClick: () => {
        setActive(key);
        if (typeof window !== "undefined") {
          window.location.hash = `#${key}`;
        }
      },
      className: `px-5 py-1.5 rounded-md text-sm font-medium transition-colors ${active === key ? "bg-primary-600 text-white shadow-sm" : "text-gray-500 hover:text-gray-700"}`
    },
    label
  ))), active === "email" && /* @__PURE__ */ React.createElement(EmailSettings, null), active === "facebook" && /* @__PURE__ */ React.createElement(FacebookSettings, null), active === "zalo" && /* @__PURE__ */ React.createElement(ZaloSettings, null), active === "whatsapp" && /* @__PURE__ */ React.createElement(WhatsAppSettings, null), active === "telegram" && /* @__PURE__ */ React.createElement(TelegramSettings, null));
};
export default ChannelSettings;
