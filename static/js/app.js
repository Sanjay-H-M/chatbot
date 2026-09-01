/**
 * Sanjay AI Chatbot Client Script
 * Handles real-time SSE streaming, multi-provider model switching,
 * chat session persistence, markdown parsing, document & image attachments,
 * dynamic theme switcher, prompt templates, and speech integration.
 */

// Configure Marked.js options
marked.setOptions({
    breaks: true,
    gfm: true,
    highlight: function(code, lang) {
        if (lang && hljs.getLanguage(lang)) {
            try {
                return hljs.highlight(code, { language: lang }).value;
            } catch (__) {}
        }
        return hljs.highlightAuto(code).value;
    }
});

// System Personas
const PERSONAS = {
    general: {
        name: "General Assistant",
        prompt: "You are Sanjay AI, an intelligent, helpful, and concise AI assistant powered by Groq and advanced LLMs. Provide accurate, well-formatted, and direct answers."
    },
    coder: {
        name: "Senior Software Architect",
        prompt: "You are a Senior Full-Stack Architect and Staff Engineer. Provide robust, clean, type-safe, and production-ready code with concise explanations and error handling."
    },
    writer: {
        name: "Creative & Copy Writer",
        prompt: "You are a world-class copywriter and storyteller. Write engaging, vivid, persuasive, and beautifully structured prose."
    },
    explainer: {
        name: "Concise & First Principles",
        prompt: "You explain complex technical topics using first principles, intuitive real-world analogies, and zero fluff. Keep responses punchy and structured."
    },
    cyber: {
        name: "Cybersecurity Analyst",
        prompt: "You are a seasoned cybersecurity specialist. Prioritize secure coding standards, defense-in-depth, vulnerability detection, and pragmatic mitigation strategies."
    },
    custom: {
        name: "Custom Persona",
        prompt: ""
    }
};

class NexusChatApp {
    constructor() {
        // State
        this.sessions = [];
        this.activeSessionId = null;
        this.models = {};
        this.providersStatus = {};
        this.abortController = null;
        this.isStreaming = false;
        this.autoTTS = false;
        this.speechRecognition = null;
        this.isRecording = false;
        this.pendingAttachments = []; // { type: 'image'|'document', filename, data_url?, content? }

        // Elements
        this.initDOMElements();

        // Load persisted data & theme
        this.loadTheme();
        this.loadSessionsFromStorage();

        // Setup event listeners
        this.bindEvents();

        // Initialize API data
        this.fetchModelsAndStatus();

        // Render Initial Lucide Icons
        lucide.createIcons();
    }

    initDOMElements() {
        this.sidebar = document.getElementById("sidebar");
        this.toggleSidebarBtn = document.getElementById("toggleSidebarBtn");
        this.closeSidebarBtn = document.getElementById("closeSidebarBtn");
        this.newChatBtn = document.getElementById("newChatBtn");
        this.searchChatsInput = document.getElementById("searchChatsInput");
        this.chatList = document.getElementById("chatList");
        this.providerSelect = document.getElementById("providerSelect");
        this.modelSelect = document.getElementById("modelSelect");
        this.personaSelect = document.getElementById("personaSelect");
        this.personaLabel = document.getElementById("personaLabel");
        this.editPersonaBtn = document.getElementById("editPersonaBtn");
        this.tempBadge = document.getElementById("tempBadge");
        this.clearChatBtn = document.getElementById("clearChatBtn");
        this.exportChatBtn = document.getElementById("exportChatBtn");
        this.settingsBtn = document.getElementById("settingsBtn");
        this.openSettingsBtnFooter = document.getElementById("openSettingsBtnFooter");

        // Theme Elements
        this.themeDropdownBtn = document.getElementById("themeDropdownBtn");
        this.themeMenu = document.getElementById("themeMenu");

        // Prompt Library Elements
        this.promptLibBtn = document.getElementById("promptLibBtn");
        this.promptLibModal = document.getElementById("promptLibModal");
        this.closePromptLibBtn = document.getElementById("closePromptLibBtn");

        // Attachments
        this.attachFileBtn = document.getElementById("attachFileBtn");
        this.fileInput = document.getElementById("fileInput");
        this.attachmentsPreview = document.getElementById("attachmentsPreview");

        this.chatViewport = document.getElementById("chatViewport");
        this.welcomeHero = document.getElementById("welcomeHero");
        this.messagesContainer = document.getElementById("messagesContainer");
        this.chatForm = document.getElementById("chatForm");
        this.userInput = document.getElementById("userInput");
        this.sendBtn = document.getElementById("sendBtn");
        this.stopBtn = document.getElementById("stopBtn");
        this.micBtn = document.getElementById("micBtn");
        this.ttsToggleBtn = document.getElementById("ttsToggleBtn");

        // Badges
        this.badgeGroq = document.getElementById("badgeGroq");
        this.badgeGemini = document.getElementById("badgeGemini");
        this.badgeHF = document.getElementById("badgeHF");

        // Modals
        this.settingsModal = document.getElementById("settingsModal");
        this.closeSettingsBtn = document.getElementById("closeSettingsBtn");
        this.cancelSettingsBtn = document.getElementById("cancelSettingsBtn");
        this.keysForm = document.getElementById("keysForm");
        this.groqKeyInput = document.getElementById("groqKeyInput");
        this.geminiKeyInput = document.getElementById("geminiKeyInput");
        this.hfKeyInput = document.getElementById("hfKeyInput");
        this.temperatureRange = document.getElementById("temperatureRange");
        this.tempValueDisplay = document.getElementById("tempValueDisplay");
        this.keyStatusBanner = document.getElementById("keyStatusBanner");

        this.personaModal = document.getElementById("personaModal");
        this.closePersonaBtn = document.getElementById("closePersonaBtn");
        this.customSystemPrompt = document.getElementById("customSystemPrompt");
        this.savePersonaBtn = document.getElementById("savePersonaBtn");
        this.resetPersonaBtn = document.getElementById("resetPersonaBtn");

        this.toastContainer = document.getElementById("toastContainer");
    }

    bindEvents() {
        // Sidebar toggle
        this.toggleSidebarBtn?.addEventListener("click", () => this.sidebar?.classList.add("open"));
        this.closeSidebarBtn?.addEventListener("click", () => this.sidebar?.classList.remove("open"));

        // New Chat
        this.newChatBtn?.addEventListener("click", () => this.createNewSession());
        document.addEventListener("keydown", (e) => {
            if (e.ctrlKey && e.key.toLowerCase() === "n") {
                e.preventDefault();
                this.createNewSession();
            }
        });

        // Search conversations
        this.searchChatsInput?.addEventListener("input", (e) => this.filterChatList(e.target.value));

        // Provider & Model changes
        this.providerSelect?.addEventListener("change", () => this.onProviderChange());
        this.personaSelect?.addEventListener("change", () => this.onPersonaChange());
        this.editPersonaBtn?.addEventListener("click", () => this.openPersonaModal());

        // Theme Menu
        this.themeDropdownBtn?.addEventListener("click", (e) => {
            e.stopPropagation();
            this.themeMenu?.classList.toggle("active");
        });
        document.addEventListener("click", () => this.themeMenu?.classList.remove("active"));
        document.querySelectorAll(".theme-option").forEach(btn => {
            btn.addEventListener("click", () => {
                const theme = btn.getAttribute("data-theme");
                this.setTheme(theme);
            });
        });

        // Prompt Library
        this.promptLibBtn?.addEventListener("click", () => this.openPromptLibModal());
        this.closePromptLibBtn?.addEventListener("click", () => this.closePromptLibModal());
        this.promptLibModal?.addEventListener("click", (e) => {
            if (e.target === this.promptLibModal) this.closePromptLibModal();
        });
        document.querySelectorAll(".template-card").forEach(card => {
            card.addEventListener("click", () => {
                const tmpl = card.getAttribute("data-template");
                if (tmpl) {
                    this.userInput.value = tmpl;
                    this.adjustTextareaHeight();
                    this.closePromptLibModal();
                    this.userInput.focus();
                }
            });
        });

        // File Attachments
        this.attachFileBtn?.addEventListener("click", () => this.fileInput?.click());
        this.fileInput?.addEventListener("change", (e) => this.handleFileUpload(e.target.files[0]));

        // Clipboard Paste Image Support
        this.userInput?.addEventListener("paste", (e) => {
            const items = (e.clipboardData || e.originalEvent.clipboardData).items;
            for (let item of items) {
                if (item.type.indexOf("image") !== -1) {
                    const blob = item.getAsFile();
                    this.handleFileUpload(blob);
                }
            }
        });

        // Clear & Export
        this.clearChatBtn?.addEventListener("click", () => this.clearCurrentChat());
        this.exportChatBtn?.addEventListener("click", () => this.exportCurrentChat());

        // Quick starter prompts
        document.querySelectorAll(".prompt-card").forEach(card => {
            card.addEventListener("click", () => {
                const prompt = card.getAttribute("data-prompt");
                if (prompt) {
                    this.userInput.value = prompt;
                    this.handleSendMessage();
                }
            });
        });

        // Chat input auto-grow & keyboard submit
        this.userInput?.addEventListener("input", () => this.adjustTextareaHeight());
        this.userInput?.addEventListener("keydown", (e) => {
            if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                this.handleSendMessage();
            }
        });

        this.chatForm?.addEventListener("submit", (e) => {
            e.preventDefault();
            this.handleSendMessage();
        });

        this.sendBtn?.addEventListener("click", (e) => {
            e.preventDefault();
            this.handleSendMessage();
        });

        this.stopBtn?.addEventListener("click", () => this.stopGeneration());

        // Voice Input & TTS
        this.micBtn?.addEventListener("click", () => this.toggleVoiceInput());
        this.ttsToggleBtn?.addEventListener("click", () => this.toggleAutoTTS());

        // Settings Modal
        this.settingsBtn?.addEventListener("click", () => this.openSettingsModal());
        this.openSettingsBtnFooter?.addEventListener("click", () => this.openSettingsModal());
        this.closeSettingsBtn?.addEventListener("click", () => this.closeSettingsModal());
        this.cancelSettingsBtn?.addEventListener("click", () => this.closeSettingsModal());
        this.settingsModal?.addEventListener("click", (e) => {
            if (e.target === this.settingsModal) this.closeSettingsModal();
        });

        // Password visibility toggles
        document.querySelectorAll(".toggle-visibility").forEach(btn => {
            btn.addEventListener("click", () => {
                const targetId = btn.getAttribute("data-target");
                const input = document.getElementById(targetId);
                if (input) {
                    if (input.type === "password") {
                        input.type = "text";
                        btn.innerHTML = `<i data-lucide="eye-off"></i>`;
                    } else {
                        input.type = "password";
                        btn.innerHTML = `<i data-lucide="eye"></i>`;
                    }
                    lucide.createIcons();
                }
            });
        });

        // Temperature slider
        this.temperatureRange?.addEventListener("input", (e) => {
            if (this.tempValueDisplay) this.tempValueDisplay.textContent = e.target.value;
            if (this.tempBadge) this.tempBadge.textContent = `Temp: ${e.target.value}`;
        });

        // Keys form submit
        this.keysForm?.addEventListener("submit", (e) => this.handleSaveKeys(e));

        // Persona Modal
        this.closePersonaBtn?.addEventListener("click", () => this.closePersonaModal());
        this.savePersonaBtn?.addEventListener("click", () => this.saveCustomPersona());
        this.resetPersonaBtn?.addEventListener("click", () => {
            if (this.customSystemPrompt) this.customSystemPrompt.value = PERSONAS.general.prompt;
            if (this.personaSelect) this.personaSelect.value = "general";
            this.onPersonaChange();
            this.closePersonaModal();
            this.showToast("Reset persona to General Assistant", "info");
        });
    }

    // ==========================================
    // Theme Management
    // ==========================================
    loadTheme() {
        const theme = localStorage.getItem("nexus_theme") || "midnight";
        this.setTheme(theme);
    }

    setTheme(theme) {
        document.documentElement.setAttribute("data-theme", theme);
        localStorage.setItem("nexus_theme", theme);
        document.querySelectorAll(".theme-option").forEach(btn => {
            btn.classList.toggle("active", btn.getAttribute("data-theme") === theme);
        });
    }

    // ==========================================
    // Prompt Library Modal
    // ==========================================
    openPromptLibModal() {
        this.promptLibModal.classList.add("active");
    }

    closePromptLibModal() {
        this.promptLibModal.classList.remove("active");
    }

    // ==========================================
    // File & Image Attachments
    // ==========================================
    async handleFileUpload(file) {
        if (!file) return;

        const formData = new FormData();
        formData.append("file", file);

        this.showToast(`Uploading ${file.name}...`, "info");

        try {
            const res = await fetch("/api/upload", {
                method: "POST",
                body: formData
            });

            if (!res.ok) {
                throw new Error("Failed to upload file");
            }

            const data = await res.json();
            this.pendingAttachments.push(data);
            this.renderAttachmentsPreview();
            this.fileInput.value = "";

            if (data.type === "image") {
                // If using Groq and not a vision model, suggest switching
                if (this.providerSelect.value === "groq" && !this.modelSelect.value.includes("qwen")) {
                    this.modelSelect.value = "qwen/qwen3.6-27b";
                    this.showToast("Switched to Groq Qwen 3.6 Vision model for image analysis!", "success");
                }
            } else {
                this.showToast(`Attached document: ${data.filename} (${data.char_count} chars)`, "success");
            }
        } catch (err) {
            console.error("Upload error:", err);
            this.showToast("Could not upload file: " + err.message, "error");
        }
    }

    renderAttachmentsPreview() {
        if (this.pendingAttachments.length === 0) {
            this.attachmentsPreview.classList.add("hidden");
            this.attachmentsPreview.innerHTML = "";
            return;
        }

        this.attachmentsPreview.classList.remove("hidden");
        this.attachmentsPreview.innerHTML = "";

        this.pendingAttachments.forEach((att, idx) => {
            const chip = document.createElement("div");
            chip.className = "attachment-chip";
            const icon = att.type === "image" ? "image" : "file-text";
            chip.innerHTML = `
                <i data-lucide="${icon}" style="width:14px;height:14px;"></i>
                <span>${this.escapeHTML(att.filename)}</span>
                <button type="button" class="remove-attachment" title="Remove attachment">
                    <i data-lucide="x" style="width:12px;height:12px;"></i>
                </button>
            `;

            chip.querySelector(".remove-attachment").addEventListener("click", () => {
                this.pendingAttachments.splice(idx, 1);
                this.renderAttachmentsPreview();
            });

            this.attachmentsPreview.appendChild(chip);
        });

        lucide.createIcons();
    }

    // ==========================================
    // API Data & Provider Setup
    // ==========================================
    async fetchModelsAndStatus() {
        try {
            const [modelsRes, statusRes] = await Promise.all([
                fetch("/api/models").then(r => r.json()),
                fetch("/api/status").then(r => r.json())
            ]);

            this.models = modelsRes.models || {};
            this.providersStatus = statusRes.providers || {};

            this.updateProviderBadges();
            this.populateModelDropdown();
        } catch (err) {
            console.error("Failed to load models or status:", err);
            this.showToast("Could not connect to Flask API backend.", "error");
        }
    }

    updateProviderBadges() {
        const updateBadge = (el, status) => {
            if (!el) return;
            if (status && status.configured) {
                el.className = "badge-pill active";
                el.title = `${status.name}: Key configured (${status.key_preview || "Active"})`;
            } else {
                el.className = "badge-pill inactive";
                el.title = `${status?.name || "Provider"}: No key set in .env`;
            }
        };

        updateBadge(this.badgeGroq, this.providersStatus.groq);
        updateBadge(this.badgeGemini, this.providersStatus.gemini);
        updateBadge(this.badgeHF, this.providersStatus.huggingface);
    }

    populateModelDropdown() {
        const provider = this.providerSelect.value;
        const modelList = this.models[provider] || [];

        this.modelSelect.innerHTML = "";
        modelList.forEach(m => {
            const opt = document.createElement("option");
            opt.value = m.id;
            opt.textContent = `${m.recommended ? "⭐ " : ""}${m.name}`;
            if (m.recommended) opt.selected = true;
            this.modelSelect.appendChild(opt);
        });
    }

    onProviderChange() {
        this.populateModelDropdown();
        const provider = this.providerSelect.value;
        const status = this.providersStatus[provider];
        if (status && !status.configured) {
            this.showToast(`Note: ${status.name} key is missing in .env`, "info");
        }
    }

    onPersonaChange() {
        const val = this.personaSelect.value;
        if (val === "custom") {
            this.openPersonaModal();
        } else {
            const persona = PERSONAS[val] || PERSONAS.general;
            this.personaLabel.textContent = persona.name;
        }
    }

    // ==========================================
    // Session & History Management
    // ==========================================
    loadSessionsFromStorage() {
        try {
            const stored = localStorage.getItem("nexus_sessions");
            if (stored) {
                this.sessions = JSON.parse(stored);
            }
        } catch (e) {
            console.error("Error reading localStorage:", e);
            this.sessions = [];
        }

        if (!this.sessions || this.sessions.length === 0) {
            this.createNewSession(false);
        } else {
            const lastActiveId = localStorage.getItem("nexus_active_session_id");
            const session = this.sessions.find(s => s.id === lastActiveId) || this.sessions[0];
            this.switchSession(session.id);
        }
        this.renderChatList();
    }

    saveSessionsToStorage() {
        try {
            localStorage.setItem("nexus_sessions", JSON.stringify(this.sessions));
            if (this.activeSessionId) {
                localStorage.setItem("nexus_active_session_id", this.activeSessionId);
            }
        } catch (e) {
            console.error("Error saving sessions:", e);
        }
    }

    createNewSession(switchImmediately = true) {
        const newSession = {
            id: "chat_" + Date.now() + "_" + Math.random().toString(36).substring(2, 7),
            title: "New Conversation",
            createdAt: new Date().toISOString(),
            messages: []
        };
        this.sessions.unshift(newSession);
        this.saveSessionsToStorage();
        this.renderChatList();

        if (switchImmediately) {
            this.switchSession(newSession.id);
            if (window.innerWidth <= 860) this.sidebar.classList.remove("open");
        }
        return newSession;
    }

    switchSession(sessionId) {
        this.activeSessionId = sessionId;
        this.saveSessionsToStorage();
        this.renderChatList();
        this.renderActiveSessionMessages();
    }

    getActiveSession() {
        return this.sessions.find(s => s.id === this.activeSessionId);
    }

    deleteSession(sessionId, e) {
        if (e) e.stopPropagation();
        this.sessions = this.sessions.filter(s => s.id !== sessionId);
        if (this.sessions.length === 0) {
            this.createNewSession(true);
        } else if (this.activeSessionId === sessionId) {
            this.switchSession(this.sessions[0].id);
        } else {
            this.saveSessionsToStorage();
            this.renderChatList();
        }
        this.showToast("Conversation deleted", "info");
    }

    renderChatList() {
        this.chatList.innerHTML = "";
        this.sessions.forEach(s => {
            const item = document.createElement("div");
            item.className = `chat-item ${s.id === this.activeSessionId ? "active" : ""}`;
            item.innerHTML = `
                <div class="chat-item-content">
                    <i data-lucide="message-square" style="width:16px;height:16px;flex-shrink:0;"></i>
                    <span class="chat-item-title">${this.escapeHTML(s.title)}</span>
                </div>
                <div class="chat-item-actions">
                    <button class="delete-chat-btn" title="Delete conversation">
                        <i data-lucide="trash" style="width:14px;height:14px;"></i>
                    </button>
                </div>
            `;

            item.addEventListener("click", () => this.switchSession(s.id));
            const deleteBtn = item.querySelector(".delete-chat-btn");
            deleteBtn.addEventListener("click", (e) => this.deleteSession(s.id, e));

            this.chatList.appendChild(item);
        });
        lucide.createIcons();
    }

    filterChatList(query) {
        const term = query.toLowerCase().trim();
        const items = this.chatList.querySelectorAll(".chat-item");
        items.forEach((item, index) => {
            const session = this.sessions[index];
            if (!session) return;
            const matchesTitle = session.title.toLowerCase().includes(term);
            const matchesMessages = session.messages.some(m => m.content.toLowerCase().includes(term));
            item.style.display = (matchesTitle || matchesMessages) ? "flex" : "none";
        });
    }

    renderActiveSessionMessages() {
        const session = this.getActiveSession();
        if (!session || session.messages.length === 0) {
            this.welcomeHero.classList.remove("hidden");
            this.messagesContainer.innerHTML = "";
            return;
        }

        this.welcomeHero.classList.add("hidden");
        this.messagesContainer.innerHTML = "";

        session.messages.forEach(msg => {
            this.appendMessageToDOM(msg.role, msg.content, msg.metrics, false);
        });

        this.scrollToBottom();
    }

    clearCurrentChat() {
        const session = this.getActiveSession();
        if (!session) return;
        session.messages = [];
        session.title = "New Conversation";
        this.saveSessionsToStorage();
        this.renderChatList();
        this.renderActiveSessionMessages();
        this.showToast("Chat cleared", "info");
    }

    exportCurrentChat() {
        const session = this.getActiveSession();
        if (!session || session.messages.length === 0) {
            this.showToast("No messages to export!", "info");
            return;
        }

        const md = session.messages.map(m => `### ${m.role === "user" ? "👤 User" : "🤖 Assistant"}\n\n${m.content}\n`).join("\n---\n\n");
        const blob = new Blob([md], { type: "text/markdown" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `chat_export_${new Date().toISOString().slice(0, 10)}.md`;
        a.click();
        URL.revokeObjectURL(a);
        this.showToast("Conversation exported as Markdown", "success");
    }

    // ==========================================
    // Messaging & Streaming Response
    // ==========================================
    async handleSendMessage() {
        if (this.isStreaming) return;

        let text = this.userInput.value.trim();
        const attachments = [...this.pendingAttachments];

        if (!text && attachments.length === 0) return;

        // If documents attached, inject into user prompt
        let promptContent = text;
        const images = [];

        attachments.forEach(att => {
            if (att.type === "image") {
                images.push(att.data_url);
            } else if (att.type === "document") {
                promptContent += `\n\n[Attached Document: ${att.filename}]\n\`\`\`\n${att.content}\n\`\`\``;
            }
        });

        const session = this.getActiveSession();
        if (!session) return;

        if (session.messages.length === 0) {
            session.title = text.length > 32 ? text.substring(0, 32) + "..." : (text || attachments[0]?.filename || "Conversation");
            this.renderChatList();
        }

        const userMsg = {
            role: "user",
            content: promptContent,
            images: images
        };
        session.messages.push(userMsg);
        this.saveSessionsToStorage();

        this.welcomeHero.classList.add("hidden");
        this.appendMessageToDOM("user", text || `[Attached: ${attachments.map(a => a.filename).join(", ")}]`);
        
        // Reset inputs
        this.userInput.value = "";
        this.pendingAttachments = [];
        this.renderAttachmentsPreview();
        this.adjustTextareaHeight();
        this.scrollToBottom();

        // Prepare System Prompt
        const personaKey = this.personaSelect.value;
        const systemPrompt = personaKey === "custom" 
            ? (this.customSystemPrompt.value || PERSONAS.general.prompt)
            : (PERSONAS[personaKey]?.prompt || PERSONAS.general.prompt);

        const payloadMessages = [
            { role: "system", content: systemPrompt },
            ...session.messages.map(m => ({
                role: m.role,
                content: m.content,
                images: m.images || []
            }))
        ];

        // Prepare UI for Assistant Streaming response
        const aiMessageBubble = this.createAIMessagePlaceholder();
        const contentDiv = aiMessageBubble.querySelector(".ai-content");
        const metricsDiv = aiMessageBubble.querySelector(".message-stats");

        this.setStreamingState(true);
        this.abortController = new AbortController();

        const provider = this.providerSelect.value;
        const model = this.modelSelect.value;
        const temperature = parseFloat(this.temperatureRange.value) || 0.7;

        const startTime = performance.now();
        let fullResponse = "";
        let tokenCount = 0;

        try {
            const response = await fetch("/api/chat", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    messages: payloadMessages,
                    provider: provider,
                    model: model,
                    temperature: temperature
                }),
                signal: this.abortController.signal
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder("utf-8");
            let buffer = "";

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split("\n\n");
                buffer = lines.pop() || "";

                for (const line of lines) {
                    if (line.startsWith("data: ")) {
                        const dataStr = line.slice(6).trim();
                        if (dataStr === "[DONE]") continue;

                        try {
                            const parsed = JSON.parse(dataStr);
                            if (parsed.error) {
                                fullResponse += `\n\n**Error**: ${parsed.error}`;
                            } else if (parsed.token) {
                                fullResponse += parsed.token;
                                tokenCount++;
                            }
                            this.renderStreamingContent(contentDiv, fullResponse);
                            this.scrollToBottom();
                        } catch (e) {
                            console.error("SSE JSON parse error:", e, line);
                        }
                    }
                }
            }

            const endTime = performance.now();
            const totalMs = Math.round(endTime - startTime);
            const tokensPerSec = tokenCount > 0 && totalMs > 0 ? ((tokenCount / (totalMs / 1000))).toFixed(1) : "0";

            const metrics = {
                provider: provider.toUpperCase(),
                model: model,
                latencyMs: totalMs,
                tps: tokensPerSec
            };

            this.renderFinalMarkdown(contentDiv, fullResponse);
            this.renderMetrics(metricsDiv, metrics);

            session.messages.push({
                role: "assistant",
                content: fullResponse,
                metrics: metrics
            });
            this.saveSessionsToStorage();

            if (this.autoTTS) {
                this.speakText(fullResponse);
            }
        } catch (err) {
            if (err.name === "AbortError") {
                fullResponse += "\n\n*(Generation stopped by user)*";
                this.renderFinalMarkdown(contentDiv, fullResponse);
                session.messages.push({ role: "assistant", content: fullResponse });
                this.saveSessionsToStorage();
            } else {
                console.error("Chat error:", err);
                fullResponse += `\n\n**Connection Error**: ${err.message || "Failed to reach AI service."}`;
                this.renderFinalMarkdown(contentDiv, fullResponse);
            }
        } finally {
            this.setStreamingState(false);
            this.abortController = null;
            this.scrollToBottom();
        }
    }

    setStreamingState(streaming) {
        this.isStreaming = streaming;
        if (streaming) {
            this.sendBtn.classList.add("hidden");
            this.stopBtn.classList.remove("hidden");
            this.userInput.disabled = true;
        } else {
            this.sendBtn.classList.remove("hidden");
            this.stopBtn.classList.add("hidden");
            this.userInput.disabled = false;
            this.userInput.focus();
        }
    }

    stopGeneration() {
        if (this.abortController) {
            this.abortController.abort();
        }
    }

    createAIMessagePlaceholder() {
        const row = document.createElement("div");
        row.className = "message-row ai-row";
        row.innerHTML = `
            <div class="avatar-badge avatar-ai">
                <i data-lucide="bot"></i>
            </div>
            <div class="message-bubble-wrapper">
                <div class="message-bubble">
                    <div class="ai-content typing-cursor"></div>
                </div>
                <div class="message-stats"></div>
            </div>
        `;
        this.messagesContainer.appendChild(row);
        lucide.createIcons();
        return row;
    }

    renderStreamingContent(el, text) {
        try {
            el.innerHTML = marked.parse(text);
        } catch (e) {
            el.textContent = text;
        }
    }

    renderFinalMarkdown(el, text) {
        el.classList.remove("typing-cursor");
        try {
            el.innerHTML = marked.parse(text);
            this.attachCodeBlockHeaders(el);
            this.attachMessageActions(el.closest(".message-bubble-wrapper"), text);
        } catch (e) {
            el.textContent = text;
        }
    }

    attachCodeBlockHeaders(container) {
        container.querySelectorAll("pre code").forEach(block => {
            const pre = block.parentElement;
            if (pre.parentElement.classList.contains("code-block-wrapper")) return;

            const codeText = block.innerText;
            const langMatch = block.className.match(/language-(\w+)/);
            const lang = langMatch ? langMatch[1] : "code";

            const wrapper = document.createElement("div");
            wrapper.className = "code-block-wrapper";

            const header = document.createElement("div");
            header.className = "code-header";
            header.innerHTML = `
                <span>${lang}</span>
                <button type="button" class="copy-btn">
                    <i data-lucide="copy" style="width:12px;height:12px;"></i>
                    <span>Copy</span>
                </button>
            `;

            const copyBtn = header.querySelector(".copy-btn");
            copyBtn.addEventListener("click", () => {
                navigator.clipboard.writeText(codeText);
                copyBtn.innerHTML = `<i data-lucide="check" style="width:12px;height:12px;"></i> Copied!`;
                lucide.createIcons();
                setTimeout(() => {
                    copyBtn.innerHTML = `<i data-lucide="copy" style="width:12px;height:12px;"></i> Copy`;
                    lucide.createIcons();
                }, 2000);
            });

            pre.parentNode.insertBefore(wrapper, pre);
            wrapper.appendChild(header);
            wrapper.appendChild(pre);
            lucide.createIcons();
        });
    }

    attachMessageActions(wrapper, text) {
        if (!wrapper || wrapper.querySelector(".message-actions")) return;

        const actionsDiv = document.createElement("div");
        actionsDiv.className = "message-actions";
        actionsDiv.innerHTML = `
            <button class="msg-action-btn copy-msg-btn" title="Copy response">
                <i data-lucide="copy" style="width:13px;height:13px;"></i> Copy
            </button>
            <button class="msg-action-btn speak-msg-btn" title="Read aloud">
                <i data-lucide="volume-2" style="width:13px;height:13px;"></i> Speak
            </button>
        `;

        actionsDiv.querySelector(".copy-msg-btn").addEventListener("click", (e) => {
            navigator.clipboard.writeText(text);
            const btn = e.currentTarget;
            btn.innerHTML = `<i data-lucide="check" style="width:13px;height:13px;"></i> Copied`;
            lucide.createIcons();
            setTimeout(() => {
                btn.innerHTML = `<i data-lucide="copy" style="width:13px;height:13px;"></i> Copy`;
                lucide.createIcons();
            }, 2000);
        });

        actionsDiv.querySelector(".speak-msg-btn").addEventListener("click", () => {
            this.speakText(text);
        });

        wrapper.appendChild(actionsDiv);
        lucide.createIcons();
    }

    renderMetrics(el, metrics) {
        if (!metrics) return;
        el.innerHTML = `
            <span class="stat-item">⚡ <strong>${metrics.provider}</strong> (${metrics.model})</span>
            <span class="stat-item">• ${metrics.tps} tokens/s</span>
            <span class="stat-item">• ${metrics.latencyMs}ms</span>
        `;
    }

    appendMessageToDOM(role, content, metrics = null, scroll = true) {
        const row = document.createElement("div");
        row.className = `message-row ${role === "user" ? "user-row" : "ai-row"}`;

        if (role === "user") {
            row.innerHTML = `
                <div class="avatar-badge avatar-user">
                    <i data-lucide="user"></i>
                </div>
                <div class="message-bubble-wrapper">
                    <div class="message-bubble">
                        <p>${this.escapeHTML(content).replace(/\n/g, "<br>")}</p>
                    </div>
                </div>
            `;
        } else {
            row.innerHTML = `
                <div class="avatar-badge avatar-ai">
                    <i data-lucide="bot"></i>
                </div>
                <div class="message-bubble-wrapper">
                    <div class="message-bubble">
                        <div class="ai-content"></div>
                    </div>
                    <div class="message-stats"></div>
                </div>
            `;
            const contentEl = row.querySelector(".ai-content");
            const metricsEl = row.querySelector(".message-stats");
            this.renderFinalMarkdown(contentEl, content);
            if (metrics) this.renderMetrics(metricsEl, metrics);
        }

        this.messagesContainer.appendChild(row);
        lucide.createIcons();
        if (scroll) this.scrollToBottom();
    }

    scrollToBottom() {
        this.chatViewport.scrollTop = this.chatViewport.scrollHeight;
    }

    adjustTextareaHeight() {
        this.userInput.style.height = "auto";
        this.userInput.style.height = Math.min(this.userInput.scrollHeight, 180) + "px";
    }

    // ==========================================
    // Speech & Audio Integrations
    // ==========================================
    toggleVoiceInput() {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) {
            this.showToast("Speech recognition is not supported in this browser.", "error");
            return;
        }

        if (this.isRecording) {
            if (this.speechRecognition) this.speechRecognition.stop();
            this.isRecording = false;
            this.micBtn.classList.remove("recording");
            return;
        }

        this.speechRecognition = new SpeechRecognition();
        this.speechRecognition.continuous = false;
        this.speechRecognition.interimResults = true;
        this.speechRecognition.lang = "en-US";

        this.speechRecognition.onstart = () => {
            this.isRecording = true;
            this.micBtn.classList.add("recording");
            this.showToast("Listening... Speak now", "info");
        };

        this.speechRecognition.onresult = (e) => {
            const transcript = Array.from(e.results)
                .map(result => result[0].transcript)
                .join("");
            this.userInput.value = transcript;
            this.adjustTextareaHeight();
        };

        this.speechRecognition.onerror = (e) => {
            console.error("Speech Recognition Error:", e);
            this.isRecording = false;
            this.micBtn.classList.remove("recording");
            this.showToast("Voice recognition error: " + e.error, "error");
        };

        this.speechRecognition.onend = () => {
            this.isRecording = false;
            this.micBtn.classList.remove("recording");
        };

        this.speechRecognition.start();
    }

    toggleAutoTTS() {
        this.autoTTS = !this.autoTTS;
        if (this.autoTTS) {
            this.ttsToggleBtn.style.color = "var(--primary)";
            this.showToast("Auto Text-to-Speech enabled", "success");
        } else {
            this.ttsToggleBtn.style.color = "";
            window.speechSynthesis?.cancel();
            this.showToast("Auto Text-to-Speech disabled", "info");
        }
    }

    speakText(text) {
        if (!window.speechSynthesis) return;
        window.speechSynthesis.cancel();

        const plainText = text.replace(/[`*_#>-]/g, "").replace(/\[(.*?)\]\(.*?\)/g, "$1");
        const utterance = new SpeechSynthesisUtterance(plainText);
        utterance.rate = 1.05;
        utterance.pitch = 1.0;
        window.speechSynthesis.speak(utterance);
    }

    // ==========================================
    // Modals & Settings Management
    // ==========================================
    openSettingsModal() {
        this.renderKeyStatusBanner();
        this.settingsModal.classList.add("active");
    }

    closeSettingsModal() {
        this.settingsModal.classList.remove("active");
    }

    renderKeyStatusBanner() {
        const groq = this.providersStatus.groq;
        const gemini = this.providersStatus.gemini;
        const hf = this.providersStatus.huggingface;

        this.keyStatusBanner.innerHTML = `
            <div><strong>Active Keys in .env:</strong></div>
            <div style="display:flex; gap:8px; flex-wrap:wrap; margin-top:4px;">
                <span class="badge-pill ${groq?.configured ? 'active' : 'inactive'}">Groq: ${groq?.configured ? 'Configured ✅' : 'Missing ⚠️'}</span>
                <span class="badge-pill ${gemini?.configured ? 'active' : 'inactive'}">Gemini: ${gemini?.configured ? 'Configured ✅' : 'Missing ⚠️'}</span>
                <span class="badge-pill ${hf?.configured ? 'active' : 'inactive'}">HF: ${hf?.configured ? 'Configured ✅' : 'Missing ⚠️'}</span>
            </div>
        `;
    }

    async handleSaveKeys(e) {
        e.preventDefault();
        const groqKey = this.groqKeyInput.value.trim();
        const geminiKey = this.geminiKeyInput.value.trim();
        const hfKey = this.hfKeyInput.value.trim();

        try {
            const res = await fetch("/api/keys/update", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    groq_key: groqKey || undefined,
                    gemini_key: geminiKey || undefined,
                    hf_key: hfKey || undefined
                })
            });
            const data = await res.json();

            if (res.ok) {
                this.providersStatus = data.providers;
                this.updateProviderBadges();
                this.showToast("API keys saved to .env successfully!", "success");
                this.closeSettingsModal();
                this.groqKeyInput.value = "";
                this.geminiKeyInput.value = "";
                this.hfKeyInput.value = "";
            } else {
                this.showToast(data.error || "Failed to update keys.", "error");
            }
        } catch (err) {
            console.error("Save keys error:", err);
            this.showToast("Failed to save keys to server.", "error");
        }
    }

    openPersonaModal() {
        this.customSystemPrompt.value = PERSONAS.custom.prompt || PERSONAS.general.prompt;
        this.personaModal.classList.add("active");
    }

    closePersonaModal() {
        this.personaModal.classList.remove("active");
    }

    saveCustomPersona() {
        const customPrompt = this.customSystemPrompt.value.trim();
        if (customPrompt) {
            PERSONAS.custom.prompt = customPrompt;
            this.personaSelect.value = "custom";
            this.personaLabel.textContent = "Custom Persona";
            this.showToast("Custom system persona applied!", "success");
        }
        this.closePersonaModal();
    }

    // ==========================================
    // Toast Notification Utility
    // ==========================================
    showToast(message, type = "info") {
        const toast = document.createElement("div");
        toast.className = `toast ${type}`;
        
        let icon = "info";
        if (type === "success") icon = "check-circle";
        if (type === "error") icon = "alert-circle";

        toast.innerHTML = `
            <i data-lucide="${icon}" style="width:16px;height:16px;flex-shrink:0;"></i>
            <span>${this.escapeHTML(message)}</span>
        `;
        this.toastContainer.appendChild(toast);
        lucide.createIcons();

        setTimeout(() => {
            toast.style.opacity = "0";
            toast.style.transform = "translateX(20px)";
            setTimeout(() => toast.remove(), 300);
        }, 3500);
    }

    escapeHTML(str) {
        if (!str) return "";
        return str
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }
}

// Initialize on DOM ready
document.addEventListener("DOMContentLoaded", () => {
    window.nexusChat = new NexusChatApp();
});
