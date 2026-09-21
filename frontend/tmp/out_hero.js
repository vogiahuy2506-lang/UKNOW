import { useState, useRef, useEffect } from "react";
import { HiOutlineX, HiOutlineSparkles } from "react-icons/hi";
import { useI18n } from "../../../i18n";
import { generatePaymentQr } from "../services/paymentAccountApi";
import VietQrMessage from "./VietQrMessage";
const BotAvatarIcon = ({ className = "w-5 h-5" }) => /* @__PURE__ */ React.createElement("svg", { className, viewBox: "0 0 24 24", fill: "none", xmlns: "http://www.w3.org/2000/svg" }, /* @__PURE__ */ React.createElement("path", { d: "M12 2C9.79 2 8 3.79 8 6V7H7C5.34 7 4 8.34 4 10V18C4 19.66 5.34 21 7 21H17C18.66 21 20 19.66 20 18V10C20 8.34 18.66 7 17 7H16V6C16 3.79 14.21 2 12 2Z", fill: "white", fillOpacity: "0.95" }), /* @__PURE__ */ React.createElement("circle", { cx: "9", cy: "13", r: "1.5", fill: "#ea580c" }), /* @__PURE__ */ React.createElement("circle", { cx: "15", cy: "13", r: "1.5", fill: "#ea580c" }), /* @__PURE__ */ React.createElement("path", { d: "M9 17H15", stroke: "#ea580c", strokeWidth: "1.5", strokeLinecap: "round" }), /* @__PURE__ */ React.createElement("rect", { x: "6", y: "4", width: "2", height: "3", rx: "1", fill: "white", fillOpacity: "0.95" }), /* @__PURE__ */ React.createElement("rect", { x: "16", y: "4", width: "2", height: "3", rx: "1", fill: "white", fillOpacity: "0.95" }));
const ChatBubbleIcon = ({ className = "w-6 h-6" }) => /* @__PURE__ */ React.createElement("svg", { className, viewBox: "0 0 24 24", fill: "currentColor", xmlns: "http://www.w3.org/2000/svg" }, /* @__PURE__ */ React.createElement("path", { d: "M12 3C6.48 3 2 6.94 2 11.8c0 2.42 1.16 4.6 3.06 6.16L2 21l3.32-1.49C6.74 20.15 9.3 20.6 12 20.6c5.52 0 10-3.94 10-8.8S17.52 3 12 3z", fill: "currentColor" }), /* @__PURE__ */ React.createElement("circle", { cx: "8", cy: "11.5", r: "1.2", fill: "white" }), /* @__PURE__ */ React.createElement("circle", { cx: "12", cy: "11.5", r: "1.2", fill: "white" }), /* @__PURE__ */ React.createElement("circle", { cx: "16", cy: "11.5", r: "1.2", fill: "white" }));
const SendIcon = ({ className = "w-4 h-4" }) => /* @__PURE__ */ React.createElement("svg", { className, viewBox: "0 0 24 24", fill: "none", xmlns: "http://www.w3.org/2000/svg" }, /* @__PURE__ */ React.createElement("path", { d: "M2.01 21L23 12L2.01 3L2 10L17 12L2 14L2.01 21Z", fill: "currentColor" }));
const CheckIcon = ({ className = "w-6 h-6" }) => /* @__PURE__ */ React.createElement("svg", { className, viewBox: "0 0 24 24", fill: "none", xmlns: "http://www.w3.org/2000/svg" }, /* @__PURE__ */ React.createElement("circle", { cx: "12", cy: "12", r: "10", fill: "currentColor", fillOpacity: "0.2" }), /* @__PURE__ */ React.createElement("path", { d: "M9 12L11 14L15 10", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round" }));
const VISITOR_ID_KEY = "founderai_consultation_visitor_id";
function getVisitorId() {
  let id = localStorage.getItem(VISITOR_ID_KEY);
  if (!id) {
    id = "v_" + Math.random().toString(36).substring(2) + Date.now().toString(36);
    localStorage.setItem(VISITOR_ID_KEY, id);
  }
  return id;
}
export default function HeroChatWidget() {
  const { t } = useI18n();
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [quotaExceeded, setQuotaExceeded] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(true);
  const [contactForm, setContactForm] = useState(null);
  const [contactData, setContactData] = useState({ name: "", email: "", phone: "", message: "" });
  const [isMinimized, setIsMinimized] = useState(true);
  const [paymentFlow, setPaymentFlow] = useState(null);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const i18nKey = (key) => t(`heroPage.${key}`);
  const quickReplies = i18nKey("heroConsultation.quickReplies") || [];
  const welcomeMessage = i18nKey("heroConsultation.welcomeMessage") || "Ch\xE0o b\u1EA1n! \u{1F44B} T\xF4i c\xF3 th\u1EC3 gi\xFAp b\u1EA1n t\xECm hi\u1EC3u v\u1EC1 Landing Page, Email Marketing, Zalo Automation v\xE0 CRM. B\u1EA1n c\u1EA7n h\u1ED7 tr\u1EE3 v\u1EC1 v\u1EA5n \u0111\u1EC1 g\xEC?";
  const widgetTitle = i18nKey("heroConsultation.title") || "Tr\u1EE3 l\xFD T\u01B0 v\u1EA5n";
  const freeChatsText = i18nKey("heroConsultation.freeChats") || "T\u01B0 v\u1EA5n mi\u1EC5n ph\xED";
  const quotaTitle = i18nKey("heroConsultation.quotaTitle") || "H\u1EBFt l\u01B0\u1EE3t t\u01B0 v\u1EA5n";
  const quotaExceededText = i18nKey("heroConsultation.quotaExceeded") || "B\u1EA1n \u0111\xE3 h\u1EBFt l\u01B0\u1EE3t t\u01B0 v\u1EA5n mi\u1EC5n ph\xED. \u0110i\u1EC1n form b\xEAn d\u01B0\u1EDBi, \u0111\u1ED9i ng\u0169 t\u01B0 v\u1EA5n s\u1EBD g\u1ECDi l\u1EA1i cho b\u1EA1n trong 24 gi\u1EDD!";
  const placeholderText = i18nKey("heroConsultation.placeholder") || "Nh\u1EADp c\xE2u h\u1ECFi...";
  const openChatText = i18nKey("heroConsultation.openChat") || "Chat t\u01B0 v\u1EA5n";
  const _closeText = i18nKey("heroConsultation.close") || "\u0110\xF3ng";
  const suggestionsTitle = i18nKey("heroConsultation.suggestionsTitle") || "G\u1EE3i \xFD:";
  const paymentAskAmountText = i18nKey("heroConsultation.paymentAskAmount") || "B\u1EA1n mu\u1ED1n thanh to\xE1n";
  const paymentAskAccountText = i18nKey("heroConsultation.paymentAskAccount") || "H\xE3y cho t\xF4i bi\u1EBFt STK v\xE0 t\xEAn ng\xE2n h\xE0ng c\u1EE7a b\u1EA1n \u0111\u1EC3 generate QR.";
  const paymentUnavailableText = i18nKey("heroConsultation.paymentUnavailable") || "Hi\u1EC7n t\u1EA1i ch\u01B0a h\u1ED7 tr\u1EE3 thanh to\xE1n t\u1EF1 \u0111\u1ED9ng.";
  useEffect(() => {
    if (isOpen && !isMinimized) {
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
      }, 100);
    }
  }, [isOpen, isMinimized, messages]);
  const handleOpen = () => {
    setIsOpen(true);
    setIsMinimized(false);
    if (messages.length === 0) {
      setMessages([{ role: "assistant", content: welcomeMessage }]);
    }
    setTimeout(() => inputRef.current?.focus(), 300);
  };
  const _handleClose = () => {
    setIsMinimized(true);
    setTimeout(() => setIsOpen(false), 200);
  };
  const handleMinimize = () => {
    setIsMinimized(true);
    setTimeout(() => setIsOpen(false), 200);
  };
  const handleQuickReply = (reply) => {
    setMessages((prev) => [...prev, { role: "user", content: reply.text }]);
    setTimeout(() => {
      setMessages((prev) => [...prev, { role: "assistant", content: reply.response }]);
    }, 300);
    if (reply.isAction === "open_campaign_demo") {
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent("open-campaign-flow", { detail: { flowKey: "email" } }));
      }, 400);
    }
  };
  function detectPaymentIntent(text) {
    const t2 = String(text || "").toLowerCase();
    const hasPayKeyword = /\b(thanh toán|pay|chuyển khoản|ck|qr|vietqr)\b/.test(t2) || /thanh toán|chuyển tiền/.test(t2);
    if (!hasPayKeyword) return null;
    const vnUnitMatch = t2.match(/(\d+(?:[.,]\d+)?)\s*(tr|triệu|k|ngàn|nghin|n)/i);
    if (vnUnitMatch) {
      const num = parseFloat(vnUnitMatch[1].replace(",", "."));
      const unit = vnUnitMatch[2].toLowerCase();
      const mult = unit === "tr" || unit === "tri\u1EC7u" ? 1e6 : unit === "k" || unit === "ng\xE0n" || unit === "nghin" || unit === "n" ? 1e3 : 1;
      const amount = Math.round(num * mult);
      if (amount > 0) return { amount };
    }
    const numericMatches = [...t2.matchAll(/(\d{1,3}(?:[.,]\d{3})+|\d{4,})/g)];
    for (const m of numericMatches) {
      const cleaned = m[1].replace(/[.,]/g, "");
      const amount = parseInt(cleaned, 10);
      if (Number.isFinite(amount) && amount >= 1e4) {
        return { amount };
      }
    }
    return null;
  }
  async function executePaymentGeneration(amount, userExtraNote) {
    setPaymentFlow({ amount, step: "generating", error: null });
    setIsLoading(true);
    try {
      const description = userExtraNote ? userExtraNote.replace(/\D+/g, "").slice(0, 8).toUpperCase() || "THANHTOAN" : "THANHTOAN";
      const data = await generatePaymentQr({ amount, description });
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "qr-card",
          // marker để render VietQrMessage bên dưới
          qrData: data
        }
      ]);
      setPaymentFlow(null);
    } catch (err) {
      const msg = err.code === "NO_PAYMENT_ACCOUNT" ? paymentUnavailableText : err.message || "Kh\xF4ng t\u1EA1o \u0111\u01B0\u1EE3c m\xE3 QR";
      setMessages((prev) => [...prev, { role: "assistant", content: msg }]);
      setPaymentFlow(null);
    } finally {
      setIsLoading(false);
    }
  }
  async function runPaymentFlow(amount) {
    setIsLoading(true);
    setMessages((prev) => [
      ...prev,
      {
        role: "assistant",
        content: `${paymentAskAmountText} ${Number(amount).toLocaleString("vi-VN")} \u0111. ${paymentAskAccountText}`
      }
    ]);
    setPaymentFlow({ amount, step: "ask_account", error: null });
    setIsLoading(false);
  }
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!input.trim() || isLoading || quotaExceeded) return;
    const userMessage = input.trim();
    setInput("");
    setIsLoading(true);
    setShowSuggestions(false);
    setMessages((prev) => [...prev, { role: "user", content: userMessage }]);
    if (paymentFlow?.step === "ask_account") {
      setIsLoading(false);
      await executePaymentGeneration(paymentFlow.amount, userMessage);
      return;
    }
    const intent = detectPaymentIntent(userMessage);
    if (intent && intent.amount > 0) {
      await runPaymentFlow(intent.amount);
      return;
    }
    try {
      const visitorId = getVisitorId();
      const response = await fetch("/api/public/hero/consultation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ visitorId, message: userMessage })
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        if (data.code === "QUOTA_EXCEEDED") {
          setQuotaExceeded(true);
          setMessages((prev) => [...prev, { role: "assistant", content: quotaExceededText }]);
        } else {
          setMessages((prev) => [...prev, {
            role: "assistant",
            content: data.message || "Xin l\u1ED7i, \u0111\xE3 x\u1EA3y ra l\u1ED7i. Vui l\xF2ng th\u1EED l\u1EA1i."
          }]);
        }
        return;
      }
      setMessages((prev) => [...prev, { role: "assistant", content: data.reply }]);
    } catch (error) {
      console.error("Consultation error:", error);
      setMessages((prev) => [...prev, {
        role: "assistant",
        content: "Xin l\u1ED7i, \u0111\xE3 x\u1EA3y ra l\u1ED7i k\u1EBFt n\u1ED1i. Vui l\xF2ng th\u1EED l\u1EA1i."
      }]);
    } finally {
      setIsLoading(false);
    }
  };
  const handleContactSubmit = async (e) => {
    e.preventDefault();
    if (!contactData.name || !contactData.email || !contactData.phone) return;
    if (!contactData.message.trim() || contactData.message.trim().length < 10) {
      setContactForm({ error: "Vui l\xF2ng m\xF4 t\u1EA3 nhu c\u1EA7u \xEDt nh\u1EA5t 10 k\xFD t\u1EF1" });
      return;
    }
    try {
      const response = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(contactData)
      });
      const data = await response.json();
      if (response.ok && data.success) {
        setContactForm({ success: true });
      } else {
        setContactForm({ error: data.message || "\u0110\xE3 x\u1EA3y ra l\u1ED7i. Vui l\xF2ng th\u1EED l\u1EA1i." });
      }
    } catch (error) {
      console.error("Contact form error:", error);
      setContactForm({ error: "\u0110\xE3 x\u1EA3y ra l\u1ED7i k\u1EBFt n\u1ED1i. Vui l\xF2ng th\u1EED l\u1EA1i." });
    }
  };
  const handleInputChange = (e) => {
    setInput(e.target.value);
  };
  const handleKeyPress = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      const form = document.getElementById("hero-chat-form");
      if (form) form.dispatchEvent(new Event("submit", { bubbles: true }));
    }
  };
  const formatMarkdown = (text) => {
    return text.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>").replace(/\n/g, "<br/>");
  };
  if (!isOpen) {
    return /* @__PURE__ */ React.createElement(
      "button",
      {
        onClick: handleOpen,
        "data-help-shot-hide": true,
        className: "fixed bottom-6 right-6 z-50 bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white rounded-full p-3 shadow-2xl hover:shadow-orange-500/30 transition-all duration-300 flex items-center gap-2 group",
        "aria-label": "Open chat"
      },
      /* @__PURE__ */ React.createElement(ChatBubbleIcon, { className: "w-6 h-6" }),
      /* @__PURE__ */ React.createElement("span", { className: "font-semibold text-sm pr-1 group-hover:pr-0 transition-all" }, openChatText),
      /* @__PURE__ */ React.createElement("span", { className: "absolute -top-1.5 -right-1.5 bg-green-400 text-white text-xs font-bold px-1.5 py-0.5 rounded-full animate-pulse" }, freeChatsText)
    );
  }
  return (
    // data-help-shot-hide: bộ chụp ảnh minh hoạ (e2e/screenshots) ẩn widget này đi,
    // nếu không nó nổi ở góc phải mọi ảnh chụp trang công khai.
    /* @__PURE__ */ React.createElement("div", { "data-help-shot-hide": true, className: `fixed bottom-6 right-6 z-50 w-[380px] max-w-[calc(100vw-48px)] transition-all duration-300 ${isMinimized ? "h-0 opacity-0 overflow-hidden" : "h-[520px] opacity-100"}` }, /* @__PURE__ */ React.createElement("div", { className: "bg-white rounded-2xl shadow-2xl border border-gray-100 h-full flex flex-col overflow-hidden" }, /* @__PURE__ */ React.createElement("div", { className: "bg-gradient-to-r from-orange-500 to-orange-600 px-4 py-3 flex items-center justify-between" }, /* @__PURE__ */ React.createElement("div", { className: "flex items-center gap-2.5" }, /* @__PURE__ */ React.createElement("div", { className: "bg-white/20 p-1.5 rounded-lg" }, /* @__PURE__ */ React.createElement(BotAvatarIcon, { className: "w-5 h-5" })), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("h3", { className: "text-white font-bold text-sm" }, widgetTitle), /* @__PURE__ */ React.createElement("p", { className: "text-orange-100 text-xs" }, freeChatsText))), /* @__PURE__ */ React.createElement("div", { className: "flex items-center gap-1.5" }, /* @__PURE__ */ React.createElement(
      "button",
      {
        onClick: handleMinimize,
        className: "text-white/80 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-colors",
        "aria-label": "Minimize"
      },
      /* @__PURE__ */ React.createElement(HiOutlineX, { className: "w-4 h-4" })
    ))), /* @__PURE__ */ React.createElement("div", { className: "flex-1 overflow-y-auto p-4 space-y-3 bg-gray-50/50" }, messages.map((msg, idx) => /* @__PURE__ */ React.createElement("div", { key: idx, className: `flex ${msg.role === "user" ? "justify-end" : "justify-start"}` }, /* @__PURE__ */ React.createElement("div", { className: `max-w-[85%] rounded-2xl px-4 py-3 ${msg.role === "user" ? "bg-gradient-to-r from-orange-500 to-orange-600 text-white rounded-br-md" : "bg-white text-gray-800 rounded-bl-md shadow-sm border border-gray-100"}` }, msg.role === "assistant" && /* @__PURE__ */ React.createElement("div", { className: "flex items-center gap-1.5 mb-1.5" }, /* @__PURE__ */ React.createElement(BotAvatarIcon, { className: "w-4 h-4" }), /* @__PURE__ */ React.createElement("span", { className: "text-xs font-medium text-gray-500" }, "Foundy")), msg.content === "qr-card" && msg.qrData ? /* @__PURE__ */ React.createElement(
      VietQrMessage,
      {
        vietqrString: msg.qrData.vietqr_string,
        account: msg.qrData.account,
        amount: msg.qrData.amount,
        description: msg.qrData.description,
        t
      }
    ) : /* @__PURE__ */ React.createElement(
      "p",
      {
        className: `text-sm leading-relaxed ${msg.role === "user" ? "" : "text-gray-700"}`,
        dangerouslySetInnerHTML: { __html: formatMarkdown(msg.content) }
      }
    )))), isLoading && /* @__PURE__ */ React.createElement("div", { className: "flex justify-start" }, /* @__PURE__ */ React.createElement("div", { className: "bg-white rounded-2xl rounded-bl-md shadow-sm border border-gray-100 px-4 py-3" }, /* @__PURE__ */ React.createElement("div", { className: "flex items-center gap-1.5" }, /* @__PURE__ */ React.createElement(BotAvatarIcon, { className: "w-4 h-4" }), /* @__PURE__ */ React.createElement("span", { className: "text-xs text-gray-500" }, "Typing...")), /* @__PURE__ */ React.createElement("div", { className: "flex gap-1 mt-2" }, /* @__PURE__ */ React.createElement("div", { className: "w-2 h-2 bg-gray-400 rounded-full animate-bounce", style: { animationDelay: "0ms" } }), /* @__PURE__ */ React.createElement("div", { className: "w-2 h-2 bg-gray-400 rounded-full animate-bounce", style: { animationDelay: "150ms" } }), /* @__PURE__ */ React.createElement("div", { className: "w-2 h-2 bg-gray-400 rounded-full animate-bounce", style: { animationDelay: "300ms" } })))), quotaExceeded && !contactForm && /* @__PURE__ */ React.createElement("div", { className: "bg-amber-50 border border-amber-200 rounded-xl p-4" }, /* @__PURE__ */ React.createElement("p", { className: "text-amber-800 text-sm font-medium mb-3" }, quotaTitle), /* @__PURE__ */ React.createElement("form", { onSubmit: handleContactSubmit, className: "space-y-3" }, /* @__PURE__ */ React.createElement(
      "input",
      {
        type: "text",
        placeholder: "H\u1ECD v\xE0 t\xEAn",
        value: contactData.name,
        onChange: (e) => setContactData({ ...contactData, name: e.target.value }),
        className: "w-full px-3 py-2 text-sm border border-amber-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-400",
        required: true
      }
    ), /* @__PURE__ */ React.createElement(
      "input",
      {
        type: "email",
        placeholder: "Email",
        value: contactData.email,
        onChange: (e) => setContactData({ ...contactData, email: e.target.value }),
        className: "w-full px-3 py-2 text-sm border border-amber-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-400",
        required: true
      }
    ), /* @__PURE__ */ React.createElement(
      "input",
      {
        type: "tel",
        placeholder: "S\u1ED1 \u0111i\u1EC7n tho\u1EA1i",
        value: contactData.phone,
        onChange: (e) => setContactData({ ...contactData, phone: e.target.value }),
        className: "w-full px-3 py-2 text-sm border border-amber-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-400",
        required: true
      }
    ), /* @__PURE__ */ React.createElement(
      "textarea",
      {
        placeholder: "C\xE2u h\u1ECFi c\u1EE7a b\u1EA1n",
        value: contactData.message,
        onChange: (e) => setContactData({ ...contactData, message: e.target.value }),
        className: "w-full px-3 py-2 text-sm border border-amber-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-400 resize-none",
        rows: 2
      }
    ), /* @__PURE__ */ React.createElement(
      "button",
      {
        type: "submit",
        className: "w-full bg-amber-500 hover:bg-amber-600 text-white font-medium py-2 rounded-lg transition-colors"
      },
      "G\u1EEDi y\xEAu c\u1EA7u"
    ))), contactForm?.success && /* @__PURE__ */ React.createElement("div", { className: "bg-green-50 border border-green-200 rounded-xl p-4 text-center" }, /* @__PURE__ */ React.createElement("div", { className: "text-green-500 mb-2" }, /* @__PURE__ */ React.createElement(CheckIcon, { className: "w-8 h-8 mx-auto" })), /* @__PURE__ */ React.createElement("p", { className: "text-green-800 font-medium" }, "\u0110\xE3 g\u1EEDi th\xE0nh c\xF4ng!"), /* @__PURE__ */ React.createElement("p", { className: "text-green-600 text-sm mt-1" }, "\u0110\u1ED9i ng\u0169 t\u01B0 v\u1EA5n s\u1EBD g\u1ECDi l\u1EA1i cho b\u1EA1n trong 24 gi\u1EDD.")), contactForm?.error && /* @__PURE__ */ React.createElement("div", { className: "bg-red-50 border border-red-200 rounded-xl p-3 text-center" }, /* @__PURE__ */ React.createElement("p", { className: "text-red-600 text-sm" }, contactForm.error)), showSuggestions && messages.length <= 2 && quickReplies.length > 0 && /* @__PURE__ */ React.createElement("div", { className: "bg-gradient-to-t from-gray-50 pt-3 -mx-5 px-5" }, /* @__PURE__ */ React.createElement("p", { className: "text-xs font-medium text-gray-500 mb-2 flex items-center gap-1.5" }, /* @__PURE__ */ React.createElement(HiOutlineSparkles, { className: "w-3 h-3 text-orange-500" }), suggestionsTitle), /* @__PURE__ */ React.createElement("div", { className: "flex flex-wrap gap-1.5" }, quickReplies.map((reply) => /* @__PURE__ */ React.createElement(
      "button",
      {
        key: reply.id,
        onClick: () => handleQuickReply(reply),
        className: "px-3 py-1.5 bg-white border border-gray-200 hover:border-orange-300 hover:bg-orange-50 text-gray-600 hover:text-orange-700 rounded-full text-xs font-medium transition-all duration-150 shadow-sm hover:shadow"
      },
      reply.text
    )))), /* @__PURE__ */ React.createElement("div", { ref: messagesEndRef })), /* @__PURE__ */ React.createElement("form", { id: "hero-chat-form", onSubmit: handleSubmit, className: "border-t border-gray-100 p-4 bg-white" }, /* @__PURE__ */ React.createElement("div", { className: "flex items-center gap-2" }, /* @__PURE__ */ React.createElement(
      "input",
      {
        ref: inputRef,
        type: "text",
        value: input,
        onChange: handleInputChange,
        onKeyPress: handleKeyPress,
        placeholder: placeholderText,
        disabled: isLoading || quotaExceeded,
        className: "flex-1 px-4 py-2.5 bg-gray-100 border-0 rounded-full text-sm focus:outline-none focus:ring-2 focus:ring-orange-300 disabled:opacity-50"
      }
    ), /* @__PURE__ */ React.createElement(
      "button",
      {
        type: "submit",
        disabled: !input.trim() || isLoading || quotaExceeded,
        className: "bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 disabled:from-gray-300 disabled:to-gray-300 text-white p-2.5 rounded-full transition-all shadow-md hover:shadow-lg disabled:shadow-none",
        "aria-label": "Send message"
      },
      /* @__PURE__ */ React.createElement(SendIcon, { className: "w-4 h-4" })
    )))))
  );
}
