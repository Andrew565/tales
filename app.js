import { initializeApp } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-app.js";
import { getFirestore, collection, addDoc, onSnapshot, query, where, orderBy, doc, updateDoc, deleteDoc, writeBatch, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js";

// --- Firebase Configuration ---
const firebaseConfig = {
   apiKey: "AIzaSyAId_guz3gwQd8_TGrer6kRCMXbDnoqcAk",
    authDomain: "andrew-tales.firebaseapp.com",
    projectId: "andrew-tales",
    storageBucket: "andrew-tales.firebasestorage.app",
    messagingSenderId: "69929858799",
    appId: "1:69929858799:web:d016f1d5b9bc7f05834d1a"
};

// Initialize Firebase
let app;
let db;

try {
    // Check if config is set before initializing
    if (firebaseConfig.apiKey) {
        app = initializeApp(firebaseConfig);
        db = getFirestore(app);
    } else {
        console.warn("Firebase config is missing. App is running in UI-only mode.");
    }
} catch (e) {
    console.error("Firebase initialization failed:", e);
}

// --- DOM Elements ---
const messageInput = document.getElementById('message-input');
const sendBtn = document.getElementById('send-btn');
const messagesContainer = document.getElementById('messages-container');
const emptyState = document.getElementById('empty-state');
const unsentSummaryBtn = document.getElementById('unsent-summary-btn');
const viewToggle = document.getElementById('view-toggle');
const toggleLabel = document.getElementById('toggle-label');
const passwordDialog = document.getElementById('password-dialog');
const passwordForm = document.getElementById('password-form');
const passwordEntryInput = document.getElementById('password-input');
const cancelEditBtn = document.getElementById('cancel-edit-btn');
const sendBtnIcon = document.getElementById('send-btn-icon');

const unsentDialog = document.getElementById('unsent-dialog');
const unsentSummaryList = document.getElementById('unsent-summary-list');
const copyBtn = document.getElementById('copy-btn');
const closeUnsentBtn = document.getElementById('close-unsent-btn');

// --- Security Check ---
let isAuthorized = localStorage.getItem('tales_authorized') === 'true';

let viewMode = 'unsent'; // 'unsent' or 'sent'
let editingMessageId = null;
let unsubscribe = null;
let currentUnsentMessages = [];

// --- Helper Functions ---

// 1. Dynamic Textarea Resizing
const adjustTextareaHeight = () => {
    if (messageInput) {
        messageInput.style.height = 'auto';
        messageInput.style.height = messageInput.scrollHeight + 'px';
    }
};

// Action: Mark as Sent
const markAsSent = async (id) => {
    if (!db) {
        document.querySelector(`.message[data-id="${id}"]`)?.remove();
        return;
    }

    try {
        const msgRef = doc(db, "messages", id);
        await updateDoc(msgRef, {
            status: "sent"
        });
    } catch (e) {
        console.error("Error marking as sent:", e);
        alert("Action Failed: " + e.message);
    }
};

// Action: Unsend
const unsendMessage = async (id) => {
    if (!db) {
        document.querySelector(`.message[data-id="${id}"]`)?.remove();
        return;
    }

    try {
        const msgRef = doc(db, "messages", id);
        await updateDoc(msgRef, {
            status: "unsent"
        });
    } catch (e) {
        console.error("Error unsending:", e);
        alert("Action Failed: " + e.message);
    }
};

// Action: Delete
const deleteMessage = async (id) => {
    if (!db) {
        document.querySelector(`.message[data-id="${id}"]`)?.remove();
        return;
    }

    try {
        await deleteDoc(doc(db, "messages", id));
    } catch (e) {
        console.error("Error deleting:", e);
        alert("Delete Failed: " + e.message);
    }
};

// Action: Start Editing
const startEditing = (id, content) => {
    editingMessageId = id;
    if (messageInput instanceof HTMLTextAreaElement) {
        messageInput.value = content;
        adjustTextareaHeight();
        messageInput.focus();
    }

    // UI feedback
    if (cancelEditBtn) cancelEditBtn.style.display = 'flex';
    if (sendBtn instanceof HTMLButtonElement) sendBtn.disabled = false;
    if (sendBtnIcon) {
        sendBtnIcon.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path><polyline points="17 21 17 13 7 13 7 21"></polyline><polyline points="7 3 7 8 15 8"></polyline></svg>`;
    }
    const wrapper = messageInput?.closest('.input-wrapper');
    if (wrapper instanceof HTMLElement) wrapper.style.borderColor = 'var(--primary-color)';
};

// Action: Cancel Editing
const cancelEditing = () => {
    editingMessageId = null;
    if (messageInput instanceof HTMLTextAreaElement) {
        messageInput.value = '';
        adjustTextareaHeight();
    }

    // Reset UI
    if (cancelEditBtn) cancelEditBtn.style.display = 'none';
    if (sendBtn instanceof HTMLButtonElement) sendBtn.disabled = true;
    if (sendBtnIcon) {
        sendBtnIcon.innerHTML = `<path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/>`;
    }
    const wrapper = messageInput?.closest('.input-wrapper');
    if (wrapper instanceof HTMLElement) wrapper.style.borderColor = 'transparent';
};

// 2. Render Message
const createMessageElement = (data, id) => {
    const div = document.createElement('div');
    div.classList.add('message');
    div.dataset.id = id;
    div.dataset.status = data.status;

    const contentWrapper = document.createElement('div');
    contentWrapper.classList.add('message-content');

    const text = document.createElement('div');
    text.classList.add('message-text');
    text.textContent = data.content;

    // Time formatting
    const time = document.createElement('div');
    time.classList.add('message-time');
    let timeStr = 'Just now';
    if (data.timestamp) {
        try {
            // Check if it's a Firestore Timestamp (has toDate) or a Date object
            const date = data.timestamp.toDate ? data.timestamp.toDate() : new Date(data.timestamp);
            timeStr = date.toLocaleString([], {
                hour: 'numeric',
                minute: '2-digit',
                month: 'short',
                day: 'numeric'
            });
        } catch (e) {
            console.error("Time format error", e);
        }
    }
    time.textContent = timeStr;

    contentWrapper.appendChild(text);
    contentWrapper.appendChild(time);

    const actions = document.createElement('div');
    actions.classList.add('message-actions');

    // Mark as Sent Button (Checkmark) - Only if unsent
    if (data.status === 'unsent') {
        const checkBtn = document.createElement('button');
        checkBtn.classList.add('action-btn');
        checkBtn.title = "Mark as sent";
        checkBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;
        checkBtn.onclick = () => markAsSent(id);
        actions.appendChild(checkBtn);
    } else if (data.status === 'sent') {
        const unsendBtn = document.createElement('button');
        unsendBtn.classList.add('action-btn');
        unsendBtn.title = "Unsend";
        unsendBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 14 4 9 9 4"/><path d="M20 20v-7a4 4 0 0 0-4-4H4"/></svg>`;
        unsendBtn.onclick = () => unsendMessage(id);
        actions.appendChild(unsendBtn);
    }

    // Edit Button (Pencil)
    const editBtn = document.createElement('button');
    editBtn.classList.add('action-btn');
    editBtn.title = "Edit";
    editBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`;
    editBtn.onclick = () => startEditing(id, data.content);
    actions.appendChild(editBtn);

    // Delete Button (Trash)
    const deleteBtn = document.createElement('button');
    deleteBtn.classList.add('action-btn', 'delete');
    deleteBtn.title = "Delete";
    deleteBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>`;
    deleteBtn.onclick = () => deleteMessage(id);

    actions.appendChild(deleteBtn);

    div.appendChild(contentWrapper);
    div.appendChild(actions);

    return div;
};

// --- Core Logic ---

// Send Message
const sendMessage = async () => {
    if (!isAuthorized) return;
    const text = messageInput.value.trim();
    if (!text) return;

    messageInput.value = '';
    adjustTextareaHeight();
    sendBtn.disabled = true;

    if (db) {
        try {
            if (editingMessageId) {
                // Update existing message
                const msgRef = doc(db, "messages", editingMessageId);
                await updateDoc(msgRef, {
                    content: text,
                    timestamp: serverTimestamp() // Optional: update timestamp on edit
                });
                cancelEditing();
            } else {
                // Add new message
                await addDoc(collection(db, "messages"), {
                    content: text,
                    status: "unsent",
                    timestamp: serverTimestamp()
                });
            }
        } catch (error) {
            console.error("Error saving document: ", error);
            alert("Save Error: " + error.message);
        }
    } else {
        // UI simulation for now
        console.log("Mock send/edit:", text);
        // ... (mock logic)
    }
};

// Unsent Summary Feature
const showUnsentSummary = () => {
    if (!isAuthorized) return;

    if (currentUnsentMessages.length === 0) {
        alert("No unsent messages to show.");
        return;
    }

    if (unsentSummaryList) {
        unsentSummaryList.innerHTML = '';
        currentUnsentMessages.forEach(msg => {
            const item = document.createElement('div');
            item.classList.add('summary-item');

            const text = document.createElement('div');
            text.classList.add('message-text');
            text.textContent = msg.content;

            const time = document.createElement('div');
            time.classList.add('message-time');
            let timeStr = 'Just now';
            if (msg.timestamp) {
                const date = msg.timestamp.toDate ? msg.timestamp.toDate() : new Date(msg.timestamp);
                timeStr = date.toLocaleString([], {
                    hour: 'numeric',
                    minute: '2-digit',
                    month: 'short',
                    day: 'numeric'
                });
            }
            time.textContent = timeStr;

            item.appendChild(text);
            item.appendChild(time);
            unsentSummaryList.appendChild(item);
        });
    }

    if (unsentDialog instanceof HTMLDialogElement) {
        unsentDialog.showModal();
    }
};

const copyUnsentToClipboard = async () => {
    if (currentUnsentMessages.length === 0) return;

    const textToCopy = currentUnsentMessages.map(msg => {
        let timeStr = 'Just now';
        if (msg.timestamp) {
            const date = msg.timestamp.toDate ? msg.timestamp.toDate() : new Date(msg.timestamp);
            timeStr = date.toLocaleString([], {
                hour: 'numeric',
                minute: '2-digit',
                month: 'short',
                day: 'numeric'
            });
        }
        return `[${timeStr}]\n${msg.content}`;
    }).join('\n\n');

    try {
        await navigator.clipboard.writeText(textToCopy);

        // Mark as sent in DB
        if (db) {
            const batch = writeBatch(db);
            currentUnsentMessages.forEach(msg => {
                const msgRef = doc(db, "messages", msg.id);
                batch.update(msgRef, {
                    status: "sent"
                });
            });
            await batch.commit();
            console.log(`Marked ${currentUnsentMessages.length} messages as sent.`);
        }

        if (unsentDialog instanceof HTMLDialogElement) {
            unsentDialog.close();
        }

    } catch (err) {
        console.error('Failed to copy: ', err);
        alert('Failed to copy to clipboard.');
    }
};

const scrollToBottom = () => {
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
};

// --- Event Listeners ---

// Textarea auto-resize
messageInput.addEventListener('input', () => {
    adjustTextareaHeight();
    sendBtn.disabled = messageInput.value.trim() === '';
});

// Send on Click
sendBtn.addEventListener('click', sendMessage);

// Send on Enter (Shift+Enter for new line)
messageInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
});

// Summary Button
unsentSummaryBtn.addEventListener('click', showUnsentSummary);

// Dialog Buttons
if (copyBtn) copyBtn.addEventListener('click', copyUnsentToClipboard);
if (closeUnsentBtn) closeUnsentBtn.addEventListener('click', () => {
    if (unsentDialog instanceof HTMLDialogElement) unsentDialog.close();
});

// Cancel Edit Button
cancelEditBtn.addEventListener('click', cancelEditing);

// View Toggle
viewToggle.addEventListener('click', () => {
    viewMode = viewMode === 'unsent' ? 'sent' : 'unsent';

    // Update UI
    toggleLabel.textContent = viewMode.charAt(0).toUpperCase() + viewMode.slice(1);
    viewToggle.classList.toggle('active', viewMode === 'sent');
    unsentSummaryBtn.style.display = viewMode === 'unsent' ? 'flex' : 'none';

    // Refresh listener
    setupListener();
});

// Password Handling
if (passwordForm && (passwordEntryInput instanceof HTMLInputElement) && (passwordDialog instanceof HTMLDialogElement)) {
    passwordForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const password = passwordEntryInput.value;

        if (password === 'iloveyou') {
            isAuthorized = true;
            localStorage.setItem('tales_authorized', 'true');
            passwordDialog.close();
            updateUIForAuth();
            setupListener();
        } else {
            alert("Incorrect password.");
            passwordEntryInput.value = '';
            passwordEntryInput.focus();
        }
    });
}

// --- Firestore Listener ---
const setupListener = () => {
    if (unsubscribe) unsubscribe();

    if (!isAuthorized) {
        messagesContainer.innerHTML = '';
        messagesContainer.appendChild(emptyState);
        emptyState.style.display = 'flex';
        emptyState.querySelector('p').textContent = 'No messages found.';
        return;
    }

    if (db) {
        const q = query(
            collection(db, "messages"),
            where("status", "==", viewMode),
            orderBy("timestamp", "asc")
        );

        unsubscribe = onSnapshot(q, (snapshot) => {
            messagesContainer.innerHTML = '';

            if (snapshot.empty) {
                messagesContainer.appendChild(emptyState);
                emptyState.style.display = 'flex';
                emptyState.querySelector('p').textContent = viewMode === 'unsent' ? 'No new notes.' : 'No sent notes.';
            } else {
                emptyState.style.display = 'none';
                const newUnsentMessages = [];
                snapshot.forEach((doc) => {
                    const data = doc.data();
                    const el = createMessageElement(data, doc.id);

                    if (viewMode === 'unsent') {
                        newUnsentMessages.push({
                            id: doc.id,
                            ...data
                        });
                    }

                    messagesContainer.appendChild(el);
                });
                if (viewMode === 'unsent') {
                    currentUnsentMessages = newUnsentMessages;
                }
                scrollToBottom();
            }
        }, (error) => {
            console.error("Snapshot error:", error);
            if (error.code === 'failed-precondition' || error.message.includes("index")) {
                alert("Build Index Required!\n\nCheck console for link.");
            } else if (error.code === 'permission-denied') {
                alert("Access Denied.\n\nCheck Firestore Rules.");
            }
        });
    }
};

const updateUIForAuth = () => {
    if (isAuthorized) {
        if (viewToggle) viewToggle.style.display = 'flex';
        if (unsentSummaryBtn && viewMode === 'unsent') unsentSummaryBtn.style.display = 'flex';
        const inputArea = document.querySelector('.input-area');
        if (inputArea instanceof HTMLElement) inputArea.style.display = 'block';
    } else {
        if (viewToggle) viewToggle.style.display = 'none';
        if (unsentSummaryBtn) unsentSummaryBtn.style.display = 'none';
        const inputArea = document.querySelector('.input-area');
        if (inputArea instanceof HTMLElement) inputArea.style.display = 'none';

        // Show dialog if not authorized
        if (passwordDialog instanceof HTMLDialogElement) {
            passwordDialog.showModal();
        }
    }
};

updateUIForAuth();
setupListener();
