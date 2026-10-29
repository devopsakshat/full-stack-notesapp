const form = document.querySelector(".note-form");
const notesContainer = document.getElementById("notes-container");
const featuredSection = document.querySelector(".prenotes");
const authPanel = document.getElementById("auth-panel");
const authTransition = document.getElementById("auth-transition");
const continueToNotes = document.getElementById("continue-to-notes");
const authForm = document.getElementById("auth-form");
const authMessage = document.getElementById("auth-message");
const authSwitch = document.getElementById("auth-switch");
const appContent = document.querySelectorAll(".app-content");
const logoutButton = document.getElementById("logout-button");
const accountLabel = document.getElementById("account-label");
const apiUrl = "/api";
let authMode = "login";
let finishAuthTransition;

const request = async (path, options = {}) => {
  const response = await fetch(`${apiUrl}${path}`, {
    ...options,
    credentials: "include",
    headers: options.body ? { "Content-Type": "application/json", ...options.headers } : options.headers,
  });
  const data = response.status === 204 ? null : await response.json();
  if (!response.ok) throw new Error(data?.error || "Request failed");
  return data;
};

const setAuthenticated = (user, revealNotes = true) => {
  authPanel.hidden = Boolean(user);
  appContent.forEach((element) => { element.hidden = !user || !revealNotes; });
  logoutButton.hidden = !user || !revealNotes;
  accountLabel.textContent = user ? user.email : "Your personal space";
  if (user && revealNotes) loadnotes();
  if (!user) {
    authTransition.hidden = true;
    notesContainer.innerHTML = "";
  }
};

const showAuthTransition = (mode) => new Promise((resolve) => {
  const isRegistration = mode === "register";
  document.getElementById("transition-title").textContent = isRegistration
    ? "Account created"
    : "Login successful";
  document.getElementById("transition-message").textContent = isRegistration
    ? "You’re signed in. Your private notes are ready."
    : "Welcome back. Taking you to your notes now.";
  authTransition.hidden = false;
  requestAnimationFrame(() => authTransition.classList.add("is-visible"));

  let completed = false;
  const finish = () => {
    if (completed) return;
    completed = true;
    window.clearTimeout(timer);
    authTransition.classList.remove("is-visible");
    window.setTimeout(() => {
      authTransition.hidden = true;
      setAuthenticated(currentUser, true);
      appContent.forEach((element) => {
        element.classList.remove("content-enter");
        requestAnimationFrame(() => element.classList.add("content-enter"));
      });
      resolve();
    }, 220);
  };

  const timer = window.setTimeout(finish, 2200);
  finishAuthTransition = finish;
});

let currentUser = null;

const updateAuthMode = () => {
  const isRegister = authMode === "register";
  document.getElementById("auth-title").textContent = isRegister ? "Create your account" : "Welcome back";
  document.getElementById("auth-subtitle").textContent = isRegister
    ? "A private space for your thoughts."
    : "Sign in to open your private notes.";
  document.getElementById("auth-submit").textContent = isRegister ? "Create account" : "Sign in";
  document.getElementById("auth-switch-prompt").textContent = isRegister ? "Already have an account?" : "New here?";
  authSwitch.textContent = isRegister ? "Sign in" : "Create an account";
  document.getElementById("auth-password").autocomplete = isRegister ? "new-password" : "current-password";
  authMessage.textContent = isRegister ? "Use at least 10 characters for your password." : "";
};

const loadnotes = async () => {
  try {
    const notes = await request("/notes");

    // Featured cards
    if (featuredSection) {
      featuredSection.hidden = notes.length > 0;
    }

    // old notes removal
    notesContainer.innerHTML = "";

    notes.forEach((note) => {
      const noteDiv = document.createElement("div");
      const noteHeading = document.createElement("h3");
      const noteContent = document.createElement("p");
      const completeBtn = document.createElement("button");
      const editBtn = document.createElement("button");
      const deleteBtn = document.createElement("button");
      const editorForm = document.createElement("form");
      const editTitle = document.createElement("input");
      const editContent = document.createElement("textarea");
      const saveEditBtn = document.createElement("button");
      const cancelEditBtn = document.createElement("button");
      const editMessage = document.createElement("p");

      noteHeading.textContent = note.title;
      noteContent.textContent = note.content;

      noteDiv.className = "note-card";

      // Complete button
      completeBtn.className = "complete-btn";
      editBtn.className = "edit-btn";
      deleteBtn.className = "delete-btn";
      editBtn.textContent = "Edit";
      completeBtn.textContent = note.isDone ? "Completed ✓" : "Mark Complete";

      editorForm.className = "note-editor";
      editorForm.hidden = true;
      editTitle.value = note.title;
      editTitle.maxLength = 100;
      editTitle.required = true;
      editTitle.setAttribute("aria-label", "Note title");
      editContent.value = note.content;
      editContent.rows = 4;
      editContent.required = true;
      editContent.setAttribute("aria-label", "Note content");
      saveEditBtn.type = "submit";
      saveEditBtn.textContent = "Save changes";
      cancelEditBtn.type = "button";
      cancelEditBtn.textContent = "Cancel";
      editMessage.className = "edit-message";
      editMessage.setAttribute("role", "status");
      editorForm.append(editTitle, editContent, editMessage, saveEditBtn, cancelEditBtn);

      editBtn.addEventListener("click", () => {
        editorForm.hidden = !editorForm.hidden;
        editMessage.textContent = "";
      });

      cancelEditBtn.addEventListener("click", () => {
        editorForm.hidden = true;
        editTitle.value = note.title;
        editContent.value = note.content;
        editMessage.textContent = "";
      });

      editorForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        saveEditBtn.disabled = true;
        try {
          await request(`/notes/${note._id}`, {
            method: "PATCH",
            body: JSON.stringify({ title: editTitle.value.trim(), content: editContent.value.trim() }),
          });
          await loadnotes();
        } catch (error) {
          editMessage.textContent = error.message;
        } finally {
          saveEditBtn.disabled = false;
        }
      });

      if (note.isDone) {
        noteDiv.classList.add("completed");
      }

      completeBtn.addEventListener("click", async () => {
        const response = await request(`/notes/${note._id}`, {
          method: "PATCH",
          body: JSON.stringify({
            isDone: !note.isDone,
          }),
        });

        if (response) await loadnotes();
      });

      // Delete button
      deleteBtn.textContent = "Delete";

      deleteBtn.addEventListener("click", async () => {
        const response = await request(`/notes/${note._id}`, {
          method: "DELETE",
        });

        if (response) await loadnotes();
      });

      noteDiv.append(noteHeading, noteContent, completeBtn, editBtn, deleteBtn, editorForm);

      notesContainer.append(noteDiv);
    });
  } catch (error) {
    console.error("Error loading notes:", error);
  }
};

form.addEventListener("submit", async (e) => {
  e.preventDefault();

  const inputText = document.getElementById("title");
  const textArea = document.getElementById("content");

  try {
    await request("/notes", {
      method: "POST",
      body: JSON.stringify({
        title: inputText.value.trim(),
        content: textArea.value.trim(),
      }),
    });

    form.reset();

    await loadnotes();
  } catch (error) {
    console.error("Error saving note:", error);
    alert(error.message || "Unable to save note");
  }
});

authSwitch.addEventListener("click", () => {
  authMode = authMode === "login" ? "register" : "login";
  updateAuthMode();
});

authForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const submitButton = document.getElementById("auth-submit");
  submitButton.disabled = true;
  authMessage.textContent = "";
  const submittedMode = authMode;

  try {
    const result = await request(`/auth/${authMode}`, {
      method: "POST",
      body: JSON.stringify({
        email: document.getElementById("auth-email").value,
        password: document.getElementById("auth-password").value,
      }),
    });
    authForm.reset();
    currentUser = result.user;
    setAuthenticated(currentUser, false);
    await showAuthTransition(submittedMode);
  } catch (error) {
    authMessage.textContent = error.message;
  } finally {
    submitButton.disabled = false;
  }
});

continueToNotes.addEventListener("click", () => finishAuthTransition?.());

logoutButton.addEventListener("click", async () => {
  try {
    await request("/auth/logout", { method: "POST" });
    setAuthenticated(null);
  } catch (error) {
    console.error("Sign out failed:", error);
  }
});

request("/auth/me")
  .then(({ user }) => {
    currentUser = user;
    setAuthenticated(user);
  })
  .catch(() => setAuthenticated(null));
