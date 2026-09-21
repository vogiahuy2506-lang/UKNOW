import { useState, useEffect, useCallback } from "react";
import {
  HiOutlineX,
  HiOutlineCheckCircle,
  HiOutlineClipboardCopy,
  HiOutlineRefresh,
  HiOutlineUserCircle
} from "react-icons/hi";
import toast from "react-hot-toast";
import chatbotApi from "../../features/chatbot/services/chatbotApi.service";
import WhatsAppChannelModal from "../../features/chatbot/components/WhatsAppChannelModal";
import TelegramChannelModal from "../../features/chatbot/components/TelegramChannelModal";
export function ChannelModal({ open, channel, chatbot, onClose }) {
  useEffect(() => {
    if (!open) return;
  }, [open]);
  if (!open || !chatbot) return null;
  if (channel === "whatsapp") {
    return /* @__PURE__ */ React.createElement(
      WhatsAppChannelModal,
      {
        open,
        onClose,
        chatbotId: chatbot.id
      }
    );
  }
  if (channel === "telegram_personal") {
    return /* @__PURE__ */ React.createElement(
      TelegramChannelModal,
      {
        open,
        onClose,
        chatbotId: chatbot.id
      }
    );
  }
  const titles = {
    zalo: "C\u1EA5u h\xECnh Zalo OA",
    facebook: "C\u1EA5u h\xECnh Facebook Messenger",
    zalo_personal: "C\u1EA5u h\xECnh Zalo c\xE1 nh\xE2n"
  };
  const subtitles = {
    zalo: "K\u1EBFt n\u1ED1i Official Account \u0111\u1EC3 t\u1EF1 \u0111\u1ED9ng h\u1ED3i \u0111\xE1p kh\xE1ch h\xE0ng",
    facebook: "K\u1EBFt n\u1ED1i Fanpage Messenger \u0111\u1EC3 t\u1EF1 \u0111\u1ED9ng tr\u1EA3 l\u1EDDi tin nh\u1EAFn",
    zalo_personal: "B\u1EADt chatbot cho t\xE0i kho\u1EA3n Zalo c\xE1 nh\xE2n c\u1EE7a b\u1EA1n"
  };
  const accent = {
    zalo: "bg-blue-50 text-blue-600",
    facebook: "bg-indigo-50 text-indigo-600",
    zalo_personal: "bg-orange-50 text-orange-600"
  };
  const letter = {
    zalo: "Z",
    facebook: "f",
    zalo_personal: "Z"
  };
  return /* @__PURE__ */ React.createElement("div", { className: "fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4" }, /* @__PURE__ */ React.createElement("div", { className: "bg-white rounded-xl shadow-xl w-full max-w-lg overflow-hidden" }, /* @__PURE__ */ React.createElement("div", { className: "px-5 py-4 flex items-center gap-3 border-b border-slate-100" }, /* @__PURE__ */ React.createElement("div", { className: `w-10 h-10 rounded-lg flex items-center justify-center font-bold text-base shrink-0 ${accent[channel]}` }, letter[channel]), /* @__PURE__ */ React.createElement("div", { className: "flex-1 min-w-0" }, /* @__PURE__ */ React.createElement("h3", { className: "text-sm font-semibold text-slate-900 truncate" }, titles[channel]), /* @__PURE__ */ React.createElement("p", { className: "text-xs text-slate-500 mt-0.5 truncate" }, subtitles[channel])), channel === "zalo_personal" && /* @__PURE__ */ React.createElement(ZaloPersonalReloadButton, null), /* @__PURE__ */ React.createElement(
    "button",
    {
      type: "button",
      onClick: onClose,
      className: "w-7 h-7 rounded-md flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 shrink-0"
    },
    /* @__PURE__ */ React.createElement(HiOutlineX, { className: "w-4 h-4" })
  )), /* @__PURE__ */ React.createElement("div", { className: "px-5 py-5" }, channel === "zalo" && /* @__PURE__ */ React.createElement(ZaloForm, { chatbot }), channel === "facebook" && /* @__PURE__ */ React.createElement(FacebookForm, { chatbot }), channel === "zalo_personal" && /* @__PURE__ */ React.createElement(ZaloPersonalForm, { chatbot })), /* @__PURE__ */ React.createElement("div", { className: "px-5 py-3 bg-slate-50 border-t border-slate-100 flex justify-end" }, /* @__PURE__ */ React.createElement(
    "button",
    {
      type: "button",
      onClick: onClose,
      className: "px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-200 rounded-lg transition-colors"
    },
    "\u0110\xF3ng"
  ))));
}
function ZaloForm({ chatbot }) {
  const [appId, setAppId] = useState("");
  const [appSecret, setAppSecret] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [webhook, setWebhook] = useState("");
  const [oaInfo, setOaInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  useEffect(() => {
    const fetchOa = async () => {
      try {
        const res = await chatbotApi.getZaloOaConfig(chatbot.id);
        const d = res?.data?.data ?? res?.data;
        if (d) {
          setAppId(d.external_channel_id || d.zalo_app_id || "");
          setDisplayName(d.display_name || "");
          if (d.webhook_url) setWebhook(d.webhook_url);
          setOaInfo(d);
        }
      } catch (e) {
        console.error("[ZaloForm] fetch failed:", e);
        toast.error(e?.response?.data?.message || "Kh\xF4ng th\u1EC3 t\u1EA3i c\u1EA5u h\xECnh Zalo OA.");
      } finally {
        setLoading(false);
      }
    };
    fetchOa();
  }, [chatbot.id]);
  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await chatbotApi.saveZaloOaConfig(chatbot.id, {
        zalo_app_id: appId.trim(),
        zalo_app_secret: appSecret.trim(),
        display_name: displayName.trim() || void 0
      });
      const saved = res?.data || res;
      if (saved?.webhook_url) setWebhook(saved.webhook_url);
      setOaInfo(saved);
      toast.success(res?.message || "\u0110\xE3 l\u01B0u c\u1EA5u h\xECnh Zalo OA.");
    } catch (err) {
      toast.error(err?.response?.data?.message || "L\u01B0u th\u1EA5t b\u1EA1i.");
    } finally {
      setSaving(false);
    }
  };
  const handleTest = async () => {
    setTesting(true);
    try {
      const res = await chatbotApi.testInboxConnection("zalo");
      if (res?.data?.ok) toast.success("Webhook \u0111\xE3 \u0111\u01B0\u1EE3c g\u1EEDi th\u1EED th\xE0nh c\xF4ng.");
      else toast.error("Webhook ch\u01B0a ph\u1EA3n h\u1ED3i.");
    } catch (err) {
      toast.error("Test th\u1EA5t b\u1EA1i.");
    } finally {
      setTesting(false);
    }
  };
  if (loading) {
    return /* @__PURE__ */ React.createElement("div", { className: "flex items-center justify-center py-8 text-slate-400 text-xs" }, /* @__PURE__ */ React.createElement(HiOutlineRefresh, { className: "w-4 h-4 animate-spin mr-2" }), "\u0110ang t\u1EA3i...");
  }
  return /* @__PURE__ */ React.createElement("div", { className: "space-y-4" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { className: "block text-xs font-medium text-slate-700 mb-1" }, "App ID (Zalo App ID)"), /* @__PURE__ */ React.createElement(
    "input",
    {
      type: "text",
      value: appId,
      onChange: (e) => setAppId(e.target.value),
      placeholder: "VD: 1234567890",
      className: "w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
    }
  )), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { className: "block text-xs font-medium text-slate-700 mb-1" }, "App Secret (Secret Key)"), /* @__PURE__ */ React.createElement(
    "input",
    {
      type: "password",
      value: appSecret,
      onChange: (e) => setAppSecret(e.target.value),
      placeholder: "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022",
      className: "w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
    }
  )), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { className: "block text-xs font-medium text-slate-700 mb-1" }, "T\xEAn hi\u1EC3n th\u1ECB (tu\u1EF3 ch\u1ECDn)"), /* @__PURE__ */ React.createElement(
    "input",
    {
      type: "text",
      value: displayName,
      onChange: (e) => setDisplayName(e.target.value),
      placeholder: "VD: Zalo OA Ch\u0103m s\xF3c kh\xE1ch h\xE0ng",
      className: "w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
    }
  )), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { className: "block text-xs font-medium text-slate-700 mb-1" }, "Webhook URL"), /* @__PURE__ */ React.createElement("div", { className: "flex gap-2" }, /* @__PURE__ */ React.createElement(
    "input",
    {
      type: "text",
      value: webhook || "N\u1ED1i xong s\u1EBD hi\u1EC7n",
      readOnly: true,
      className: "flex-1 px-3 py-2 text-xs border border-slate-200 rounded-lg bg-slate-50 font-mono text-slate-600"
    }
  ), /* @__PURE__ */ React.createElement(
    "button",
    {
      type: "button",
      disabled: !webhook,
      onClick: () => {
        if (!webhook) return;
        navigator.clipboard.writeText(webhook);
        toast.success("\u0110\xE3 copy webhook.");
      },
      className: "px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50 border border-slate-200 rounded-lg",
      title: "Copy Webhook URL"
    },
    /* @__PURE__ */ React.createElement(HiOutlineClipboardCopy, { className: "w-4 h-4" })
  ))), oaInfo?.is_active || oaInfo?.display_name ? /* @__PURE__ */ React.createElement("div", { className: "flex items-center gap-2 text-xs text-green-700 bg-green-50 px-3 py-2 rounded-lg" }, /* @__PURE__ */ React.createElement(HiOutlineCheckCircle, { className: "w-4 h-4" }), oaInfo?.display_name ? `\u0110\xE3 k\u1EBFt n\u1ED1i: ${oaInfo.display_name}` : "OA \u0111\xE3 k\u1EBFt n\u1ED1i") : null, /* @__PURE__ */ React.createElement("div", { className: "flex gap-2 pt-2" }, /* @__PURE__ */ React.createElement(
    "button",
    {
      type: "button",
      onClick: handleSave,
      disabled: saving || !appId || !appSecret,
      className: "flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg disabled:opacity-50 transition-colors"
    },
    saving ? "\u0110ang l\u01B0u..." : "L\u01B0u c\u1EA5u h\xECnh"
  ), /* @__PURE__ */ React.createElement(
    "button",
    {
      type: "button",
      onClick: handleTest,
      disabled: testing,
      className: "px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-medium rounded-lg disabled:opacity-50 transition-colors"
    },
    testing ? "\u0110ang test..." : "Test webhook"
  )));
}
function FacebookForm({ chatbot }) {
  const [pages, setPages] = useState([]);
  const [loadingPages, setLoadingPages] = useState(true);
  const [selectedConnId, setSelectedConnId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [pageInfo, setPageInfo] = useState(null);
  const [pageId, setPageId] = useState("");
  const [pageToken, setPageToken] = useState("");
  const [pageName, setPageName] = useState("");
  const [verifyToken, setVerifyToken] = useState("");
  const [webhook, setWebhook] = useState("");
  const [mode, setMode] = useState("picker");
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const cfgRes = await chatbotApi.getFacebookPageConfig(chatbot.id);
        const cfg = cfgRes?.data || null;
        if (!cancelled && cfg) {
          setPageInfo(cfg);
          setPageId(cfg.external_channel_id || cfg.page_id || "");
          setPageName(cfg.display_name || "");
          if (cfg.webhook_url) setWebhook(cfg.webhook_url);
          if (cfg.verify_token || cfg.credentials?.verify_token) {
            setVerifyToken(cfg.verify_token || cfg.credentials?.verify_token);
          }
        }
        const pagesRes = await chatbotApi.getFacebookPagesForChatbot(chatbot.id);
        const list = pagesRes?.data || [];
        if (!cancelled) {
          setPages(Array.isArray(list) ? list : []);
          if (list.length === 0) {
            setMode("manual");
          } else {
            setMode("picker");
            const active = list.find((p) => p.is_active_on_this_chatbot);
            if (active) setSelectedConnId(active.id);
          }
        }
      } catch (e) {
        console.error("[FacebookForm] load failed:", e);
        if (!cancelled) setMode("legacy");
        toast.error(e?.response?.data?.message || "Kh\xF4ng th\u1EC3 t\u1EA3i c\u1EA5u h\xECnh Facebook Page.");
      } finally {
        if (!cancelled) setLoadingPages(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [chatbot.id]);
  const handleSavePicker = async () => {
    if (!selectedConnId) {
      toast.error("Vui l\xF2ng ch\u1ECDn m\u1ED9t Fanpage.");
      return;
    }
    setSaving(true);
    try {
      const res = await chatbotApi.saveFacebookPageConfig(chatbot.id, {
        channel_connection_id: selectedConnId
      });
      const saved = res?.data || res;
      if (saved?.webhook_url) setWebhook(saved.webhook_url);
      if (saved?.verify_token) setVerifyToken(saved.verify_token);
      setPageInfo(saved);
      toast.success(res?.message || "\u0110\xE3 l\u01B0u c\u1EA5u h\xECnh Facebook Page.");
    } catch (err) {
      toast.error(err?.response?.data?.message || "L\u01B0u th\u1EA5t b\u1EA1i.");
    } finally {
      setSaving(false);
    }
  };
  const handleSaveManual = async () => {
    setSaving(true);
    try {
      const res = await chatbotApi.saveFacebookPageConfig(chatbot.id, {
        page_id: pageId.trim(),
        page_access_token: pageToken.trim(),
        page_name: pageName.trim() || void 0
      });
      const saved = res?.data || res;
      if (saved?.webhook_url) setWebhook(saved.webhook_url);
      if (saved?.verify_token) setVerifyToken(saved.verify_token);
      setPageInfo(saved);
      toast.success(res?.message || "\u0110\xE3 l\u01B0u c\u1EA5u h\xECnh Facebook Page.");
    } catch (err) {
      toast.error(err?.response?.data?.message || "L\u01B0u th\u1EA5t b\u1EA1i.");
    } finally {
      setSaving(false);
    }
  };
  if (loadingPages) {
    return /* @__PURE__ */ React.createElement("div", { className: "flex items-center justify-center py-8 text-slate-400 text-xs" }, /* @__PURE__ */ React.createElement(HiOutlineRefresh, { className: "w-4 h-4 animate-spin mr-2" }), "\u0110ang t\u1EA3i...");
  }
  return /* @__PURE__ */ React.createElement("div", { className: "space-y-4" }, mode === "picker" ? /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("div", { className: "text-xs text-slate-600" }, "Ch\u1ECDn Fanpage \u0111\xE3 li\xEAn k\u1EBFt. Token v\xE0 Webhook s\u1EBD t\u1EF1 \u0111\u1ED9ng \xE1p d\u1EE5ng."), /* @__PURE__ */ React.createElement("div", { className: "space-y-2" }, pages.map((p) => {
    const isSelected = selectedConnId === p.id;
    const isActiveOnThis = p.is_active_on_this_chatbot;
    return /* @__PURE__ */ React.createElement(
      "label",
      {
        key: p.id,
        className: `flex items-center gap-3 px-3 py-2.5 rounded-lg border cursor-pointer transition-colors ${isSelected ? "border-indigo-300 bg-indigo-50/30" : "border-slate-200 bg-white hover:border-slate-300"}`
      },
      /* @__PURE__ */ React.createElement(
        "input",
        {
          type: "radio",
          name: "fb-page",
          value: p.id,
          checked: isSelected,
          onChange: () => setSelectedConnId(p.id),
          className: "w-4 h-4 text-indigo-600 focus:ring-indigo-500 shrink-0"
        }
      ),
      /* @__PURE__ */ React.createElement("div", { className: "w-8 h-8 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold text-sm shrink-0" }, "f"),
      /* @__PURE__ */ React.createElement("div", { className: "flex-1 min-w-0" }, /* @__PURE__ */ React.createElement("p", { className: "text-sm font-medium text-slate-900 truncate" }, p.fb_page_name || p.display_name || "Facebook Page"), /* @__PURE__ */ React.createElement("p", { className: "text-[11px] text-slate-400 font-mono truncate" }, "ID: ", p.fb_page_id)),
      isActiveOnThis && /* @__PURE__ */ React.createElement("span", { className: "shrink-0 inline-flex items-center gap-1 text-[11px] text-green-700 bg-green-50 px-2 py-0.5 rounded-full border border-green-200" }, /* @__PURE__ */ React.createElement(HiOutlineCheckCircle, { className: "w-3 h-3" }), "\u0110ang d\xF9ng")
    );
  })), /* @__PURE__ */ React.createElement("div", { className: "flex items-center justify-between pt-1" }, /* @__PURE__ */ React.createElement(
    "button",
    {
      type: "button",
      onClick: () => setMode("manual"),
      className: "text-xs text-slate-500 hover:text-slate-700 underline"
    },
    "Nh\u1EADp Page ID/Token th\u1EE7 c\xF4ng"
  ), /* @__PURE__ */ React.createElement(
    "a",
    {
      href: "/app/settings/channels#facebook",
      target: "_blank",
      rel: "noreferrer",
      className: "text-xs text-indigo-600 hover:text-indigo-700 underline"
    },
    "+ K\u1EBFt n\u1ED1i th\xEAm Fanpage"
  )), /* @__PURE__ */ React.createElement(
    "button",
    {
      type: "button",
      onClick: handleSavePicker,
      disabled: saving || !selectedConnId,
      className: "w-full px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg disabled:opacity-50 transition-colors"
    },
    saving ? "\u0110ang l\u01B0u..." : "L\u01B0u c\u1EA5u h\xECnh"
  )) : /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("div", { className: "bg-amber-50/50 border border-amber-100 rounded-lg p-3 text-xs text-slate-600" }, mode === "manual" ? "B\u1EA1n ch\u01B0a li\xEAn k\u1EBFt Fanpage n\xE0o. " : "\u0110ang d\xF9ng ch\u1EBF \u0111\u1ED9 nh\u1EADp tay (legacy). ", /* @__PURE__ */ React.createElement(
    "a",
    {
      href: "/app/settings/channels#facebook",
      target: "_blank",
      rel: "noreferrer",
      className: "text-indigo-600 hover:text-indigo-700 underline font-medium"
    },
    "Li\xEAn k\u1EBFt Fanpage trong C\xE0i \u0111\u1EB7t \u2192 K\xEAnh"
  ), " ", "\u0111\u1EC3 ch\u1ECDn t\u1EEB danh s\xE1ch c\xF3 s\u1EB5n."), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { className: "block text-xs font-medium text-slate-700 mb-1" }, "Page ID"), /* @__PURE__ */ React.createElement(
    "input",
    {
      type: "text",
      value: pageId,
      onChange: (e) => setPageId(e.target.value),
      placeholder: "VD: 1234567890",
      className: "w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
    }
  )), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { className: "block text-xs font-medium text-slate-700 mb-1" }, "Page Access Token"), /* @__PURE__ */ React.createElement(
    "input",
    {
      type: "password",
      value: pageToken,
      onChange: (e) => setPageToken(e.target.value),
      placeholder: "EAAxxxxxxx...",
      className: "w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
    }
  )), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { className: "block text-xs font-medium text-slate-700 mb-1" }, "T\xEAn Page (tu\u1EF3 ch\u1ECDn)"), /* @__PURE__ */ React.createElement(
    "input",
    {
      type: "text",
      value: pageName,
      onChange: (e) => setPageName(e.target.value),
      placeholder: "VD: UKNOW Official Fanpage",
      className: "w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
    }
  )), /* @__PURE__ */ React.createElement(
    "button",
    {
      type: "button",
      onClick: handleSaveManual,
      disabled: saving || !pageId || !pageToken,
      className: "w-full px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg disabled:opacity-50 transition-colors"
    },
    saving ? "\u0110ang l\u01B0u..." : "L\u01B0u c\u1EA5u h\xECnh"
  )), (webhook || verifyToken) && /* @__PURE__ */ React.createElement("div", { className: "space-y-3 pt-2 border-t border-slate-100" }, verifyToken && /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { className: "block text-xs font-medium text-slate-700 mb-1" }, "Verify Token"), /* @__PURE__ */ React.createElement("div", { className: "flex gap-2" }, /* @__PURE__ */ React.createElement(
    "input",
    {
      type: "text",
      value: verifyToken,
      readOnly: true,
      className: "flex-1 px-3 py-2 text-xs border border-slate-200 rounded-lg bg-slate-50 font-mono text-slate-600"
    }
  ), /* @__PURE__ */ React.createElement(
    "button",
    {
      type: "button",
      onClick: () => {
        navigator.clipboard.writeText(verifyToken);
        toast.success("\u0110\xE3 copy verify token.");
      },
      className: "px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100 border border-slate-200 rounded-lg",
      title: "Copy Verify Token"
    },
    /* @__PURE__ */ React.createElement(HiOutlineClipboardCopy, { className: "w-4 h-4" })
  )), /* @__PURE__ */ React.createElement("p", { className: "text-[11px] text-slate-400 mt-1" }, "Copy v\xE0o Meta App Dashboard khi c\u1EA5u h\xECnh Webhook.")), webhook && /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { className: "block text-xs font-medium text-slate-700 mb-1" }, "Webhook URL"), /* @__PURE__ */ React.createElement("div", { className: "flex gap-2" }, /* @__PURE__ */ React.createElement(
    "input",
    {
      type: "text",
      value: webhook,
      readOnly: true,
      className: "flex-1 px-3 py-2 text-xs border border-slate-200 rounded-lg bg-slate-50 font-mono text-slate-600"
    }
  ), /* @__PURE__ */ React.createElement(
    "button",
    {
      type: "button",
      onClick: () => {
        navigator.clipboard.writeText(webhook);
        toast.success("\u0110\xE3 copy webhook.");
      },
      className: "px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100 border border-slate-200 rounded-lg",
      title: "Copy Webhook URL"
    },
    /* @__PURE__ */ React.createElement(HiOutlineClipboardCopy, { className: "w-4 h-4" })
  )))), pageInfo?.is_active || pageInfo?.display_name ? /* @__PURE__ */ React.createElement("div", { className: "flex items-center gap-2 text-xs text-green-700 bg-green-50 px-3 py-2 rounded-lg" }, /* @__PURE__ */ React.createElement(HiOutlineCheckCircle, { className: "w-4 h-4" }), pageInfo?.display_name ? `\u0110\xE3 k\u1EBFt n\u1ED1i: ${pageInfo.display_name}` : "Fanpage \u0111\xE3 k\u1EBFt n\u1ED1i") : null);
}
function Toggle({ checked, onChange, disabled }) {
  return /* @__PURE__ */ React.createElement(
    "button",
    {
      type: "button",
      role: "switch",
      "aria-checked": checked,
      disabled,
      onClick: () => onChange(!checked),
      className: `relative inline-flex h-5 w-9 items-center rounded-full transition-colors shrink-0 ${checked ? "bg-blue-600" : "bg-slate-200"} ${disabled ? "opacity-50 cursor-not-allowed" : ""}`
    },
    /* @__PURE__ */ React.createElement(
      "span",
      {
        className: `inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${checked ? "translate-x-5" : "translate-x-1"}`
      }
    )
  );
}
function ZaloPersonalReloadButton() {
  const onReload = () => window.location.reload();
  return /* @__PURE__ */ React.createElement(
    "button",
    {
      type: "button",
      onClick: onReload,
      className: "w-7 h-7 rounded-md flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100",
      title: "T\u1EA3i l\u1EA1i"
    },
    /* @__PURE__ */ React.createElement(HiOutlineRefresh, { className: "w-4 h-4" })
  );
}
function ZaloPersonalForm({ chatbot }) {
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [togglingId, setTogglingId] = useState(null);
  const fetchAccounts = useCallback(async () => {
    try {
      const res = await chatbotApi.listZaloAccountsWithChatbotSettings(chatbot.id);
      const rawList = res?.data?.data || [];
      setAccounts(Array.isArray(rawList) ? rawList : []);
    } catch (e) {
      console.error("[ZaloPersonalForm] fetch failed:", e);
      toast.error("Kh\xF4ng th\u1EC3 t\u1EA3i danh s\xE1ch t\xE0i kho\u1EA3n Zalo.");
    } finally {
      setLoading(false);
    }
  }, [chatbot.id]);
  useEffect(() => {
    fetchAccounts();
    const onReload = () => fetchAccounts();
    window.addEventListener("zalo-personal:reload", onReload);
    return () => window.removeEventListener("zalo-personal:reload", onReload);
  }, [fetchAccounts]);
  const handleToggle = async (acc, enabled) => {
    setTogglingId(acc.id);
    try {
      await chatbotApi.toggleZaloAccountChatbot(acc.id, enabled, chatbot.id);
      setAccounts(
        (prev) => prev.map((a) => a.id === acc.id ? { ...a, is_enabled: enabled, chatbot_enabled: enabled } : a)
      );
      toast.success(enabled ? `\u0110\xE3 b\u1EADt chatbot cho ${acc.name || acc.phone || acc.zalo_user_id}` : "\u0110\xE3 t\u1EAFt chatbot");
    } catch (err) {
      console.error("[ZaloPersonalForm] toggle failed:", err);
      toast.error(err?.response?.data?.message || "Kh\xF4ng th\u1EC3 c\u1EADp nh\u1EADt.");
    } finally {
      setTogglingId(null);
    }
  };
  return /* @__PURE__ */ React.createElement("div", { className: "space-y-4" }, /* @__PURE__ */ React.createElement("div", { className: "bg-orange-50/50 border border-orange-100 rounded-lg p-3" }, /* @__PURE__ */ React.createElement("p", { className: "text-xs text-slate-600" }, "B\u1EADt/t\u1EAFt chatbot cho t\u1EEBng t\xE0i kho\u1EA3n Zalo c\xE1 nh\xE2n \u0111\xE3 li\xEAn k\u1EBFt.")), /* @__PURE__ */ React.createElement("div", { className: "space-y-1" }, loading ? /* @__PURE__ */ React.createElement("div", { className: "flex items-center justify-center py-8 text-slate-400 text-xs" }, /* @__PURE__ */ React.createElement(HiOutlineRefresh, { className: "w-4 h-4 animate-spin mr-2" }), "\u0110ang t\u1EA3i danh s\xE1ch t\xE0i kho\u1EA3n...") : accounts.length === 0 ? /* @__PURE__ */ React.createElement("div", { className: "text-center py-8 bg-slate-50 rounded-xl border border-dashed border-slate-200" }, /* @__PURE__ */ React.createElement("div", { className: "w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-2" }, /* @__PURE__ */ React.createElement(HiOutlineUserCircle, { className: "w-5 h-5 text-slate-400" })), /* @__PURE__ */ React.createElement("p", { className: "text-sm font-medium text-slate-700" }, "Ch\u01B0a li\xEAn k\u1EBFt t\xE0i kho\u1EA3n Zalo"), /* @__PURE__ */ React.createElement("p", { className: "text-xs text-slate-400 mt-1 px-6" }, "V\xE0o", " ", /* @__PURE__ */ React.createElement(
    "a",
    {
      href: "/app/settings/channels",
      target: "_blank",
      rel: "noreferrer",
      className: "text-primary-600 hover:text-primary-700 font-medium underline underline-offset-2"
    },
    "C\xE0i \u0111\u1EB7t \u2192 K\xEAnh li\xEAn k\u1EBFt"
  ), " ", "\u0111\u1EC3 th\xEAm t\xE0i kho\u1EA3n Zalo, sau \u0111\xF3 quay l\u1EA1i \u0111\xE2y.")) : accounts.map((acc) => {
    const isOn = !!(acc.chatbot_enabled ?? acc.is_enabled);
    const busy = togglingId === acc.id;
    const isLikelyZaloId = (v) => {
      if (!v) return false;
      const str = String(v).replace(/[\s-]/g, "");
      return /^\d{9,15}$/.test(str);
    };
    const candidates = [acc.display_name, acc.zalo_name, acc.zalo_phone, acc.zalo_user_id, acc.phone];
    const displayName = candidates.find(
      (v) => v && !isLikelyZaloId(v)
    ) || (acc.zalo_user_id && !isLikelyZaloId(acc.zalo_user_id) ? acc.zalo_user_id : "Zalo Account");
    const subtitle = acc.zalo_phone && !isLikelyZaloId(acc.zalo_phone) ? acc.zalo_phone : acc.phone && !isLikelyZaloId(acc.phone) ? acc.phone : acc.zalo_user_id || `ID: ${acc.id}`;
    const avatarChar = (displayName || "Z").charAt(0).toUpperCase();
    return /* @__PURE__ */ React.createElement(
      "div",
      {
        key: acc.id,
        className: "flex items-center gap-3 px-3 py-2.5 bg-white border border-slate-200 rounded-lg hover:border-slate-300 transition-colors"
      },
      /* @__PURE__ */ React.createElement("div", { className: "w-9 h-9 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center shrink-0 font-bold" }, acc.avatar && typeof acc.avatar === "string" && acc.avatar.startsWith("http") ? /* @__PURE__ */ React.createElement("img", { src: acc.avatar, alt: "", className: "w-9 h-9 rounded-full object-cover" }) : avatarChar),
      /* @__PURE__ */ React.createElement("div", { className: "flex-1 min-w-0" }, /* @__PURE__ */ React.createElement("p", { className: "text-sm font-medium text-slate-900 truncate" }, displayName), /* @__PURE__ */ React.createElement("p", { className: "text-[11px] text-slate-400 truncate" }, subtitle)),
      /* @__PURE__ */ React.createElement(Toggle, { checked: isOn, disabled: busy, onChange: (v) => handleToggle(acc, v) })
    );
  })));
}
