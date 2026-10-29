import "dotenv/config";
import express from "express";
import cors from "cors";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const app = express();
const api = express.Router();
const publicDirectory = join(dirname(fileURLToPath(import.meta.url)), "public");
const isProduction = process.env.NODE_ENV === "production";
const authCookieName = "notesapp_token";
const jwtOptions = { issuer: "notesapp", audience: "notesapp-users" };
const cookieOptions = {
  httpOnly: true,
  secure: isProduction,
  sameSite: "lax",
  path: "/",
};

app.use(helmet({ contentSecurityPolicy: { directives: { "upgrade-insecure-requests": null } } }));
app.use(cors({ origin: process.env.CLIENT_ORIGIN || "http://localhost:5000", credentials: true }));
app.use(express.json());
app.use(cookieParser());
app.use(express.static(publicDirectory, { dotfiles: "deny", index: "index.html" }));

const authLimiter = rateLimit({
  windowMs: 2 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Too many authentication attempts. Try again later." },
});

const createToken = (userId) => jwt.sign({ sub: userId }, process.env.JWT_SECRET, { ...jwtOptions, expiresIn: "7d" });

const setAuthCookie = (res, userId) => {
  res.cookie(authCookieName, createToken(userId), { ...cookieOptions, maxAge: 7 * 24 * 60 * 60 * 1000 });
};

const requireAuth = (req, res, next) => {
  const token = req.cookies[authCookieName];
  if (!token) return res.status(401).json({ error: "Please sign in to continue" });

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET, jwtOptions);
    req.userId = payload.sub;
    next();
  } catch {
    res.clearCookie(authCookieName, cookieOptions);
    return res.status(401).json({ error: "Your session has expired. Please sign in again." });
  }
};

const userSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: 254 },
    passwordHash: { type: String, required: true, select: false },
  },
  { timestamps: true },
);

const User = mongoose.model("NotesAppUser", userSchema, "notesapp_users");

const noteSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: "NotesAppUser", required: true, index: true },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    content: {
      type: String,
      required: true,
      trim: true,
    },
    isDone: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true },
);

const Note = mongoose.model("Note", noteSchema);

let mongoConnectionPromise;

const connectToDatabase = async () => {
  if (mongoose.connection.readyState === 1) return;
  if (!process.env.MONGODB_URI) throw new Error("MONGODB_URI is not configured");

  if (!mongoConnectionPromise) {
    mongoConnectionPromise = mongoose.connect(process.env.MONGODB_URI).catch((error) => {
      mongoConnectionPromise = undefined;
      throw error;
    });
  }

  await mongoConnectionPromise;
};

api.use(async (req, res, next) => {
  try {
    await connectToDatabase();
    next();
  } catch (error) {
    console.error("MongoDB connection failed:", error.message);
    res.status(503).json({ error: "Database unavailable. Please try again shortly." });
  }
});

api.post("/auth/register", authLimiter, async (req, res) => {
  const email = typeof req.body.email === "string" ? req.body.email.trim().toLowerCase() : "";
  const password = typeof req.body.password === "string" ? req.body.password : "";

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    return res.status(400).json({ error: "Enter a valid email address" });
  }
  if (password.length < 10 || password.length > 128) {
    return res.status(400).json({ error: "Password must be between 10 and 128 characters" });
  }

  try {
    const passwordHash = await bcrypt.hash(password, 12);
    const user = await User.create({ email, passwordHash });
    setAuthCookie(res, user.id);
    res.status(201).json({ user: { id: user.id, email: user.email } });
  } catch (error) {
    if (error.code === 11000) return res.status(409).json({ error: "An account with this email already exists" });
    console.error("Registration failed:", error.message);
    res.status(500).json({ error: "Unable to create account right now" });
  }
});

api.post("/auth/login", authLimiter, async (req, res) => {
  const email = typeof req.body.email === "string" ? req.body.email.trim().toLowerCase() : "";
  const password = typeof req.body.password === "string" ? req.body.password : "";

  try {
    const user = await User.findOne({ email }).select("+passwordHash");
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      return res.status(401).json({ error: "Email or password is incorrect" });
    }
    setAuthCookie(res, user.id);
    res.json({ user: { id: user.id, email: user.email } });
  } catch (error) {
    console.error("Login failed:", error.message);
    res.status(500).json({ error: "Unable to sign in right now" });
  }
});

api.post("/auth/logout", (req, res) => {
  res.clearCookie(authCookieName, cookieOptions);
  res.status(204).end();
});

api.get("/auth/me", requireAuth, async (req, res) => {
  const user = await User.findById(req.userId).select("email");
  if (!user) return res.status(401).json({ error: "Account not found" });
  res.json({ user: { id: user.id, email: user.email } });
});

api.get("/notes", requireAuth, async (req, res) => {
  try {
    const notes = await Note.find({ owner: req.userId }).sort({ createdAt: -1 });
    res.json(notes);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to fetch notes" });
  }
});

// POST
api.post("/notes", requireAuth, async (req, res) => {
  try {
    const { title, content } = req.body;

    if (!title?.trim() || !content?.trim()) {
      return res.status(400).json({
        error: "Title and content are required",
      });
    }

    const note = await Note.create({
      owner: req.userId,
      title: title.trim(),
      content: content.trim(),
    });

    res.status(201).json(note);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to save note" });
  }
});

// Complete / uncomplete note:
api.patch("/notes/:id", requireAuth, async (req, res) => {
  try {
    const updates = {};
    if (typeof req.body.isDone === "boolean") updates.isDone = req.body.isDone;
    if (typeof req.body.title === "string" && req.body.title.trim()) updates.title = req.body.title.trim();
    if (typeof req.body.content === "string" && req.body.content.trim()) updates.content = req.body.content.trim();
    if (!Object.keys(updates).length) return res.status(400).json({ error: "Provide a valid note update" });

    const note = await Note.findOneAndUpdate(
      { _id: req.params.id, owner: req.userId },
      updates,
      { new: true, runValidators: true },
    );

    if (!note) {
      return res.status(404).json({ error: "Note not found" });
    }

    res.json(note);
  } catch (error) {
    res.status(400).json({ error: "Failed to update note" });
  }
});

// del note 

api.delete("/notes/:id", requireAuth, async (req, res) => {
  try {
    const note = await Note.findOneAndDelete({ _id: req.params.id, owner: req.userId });

    if (!note) {
      return res.status(404).json({ error: "Note not found" });
    }

    res.json({ message: "Note deleted successfully" });
  } catch (error) {
    res.status(400).json({ error: "Failed to delete note" });
  }
});

app.use("/api", api);


// MongoDB
const startServer = async () => {
  try {
    if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
      throw new Error("JWT_SECRET must be set to a random value of at least 32 characters");
    }
    await connectToDatabase();
    console.log("MongoDB connected!");

    const port = process.env.PORT || 5000;
    const host = isProduction ? "0.0.0.0" : "127.0.0.1";
    app.listen(port, host, () => {
      console.log(`Server running on port ${process.env.PORT || 5000}`);
    });
  } catch (error) {
    console.error("Server startup failed:", error.message);
  }
};

if (!process.env.VERCEL && process.env.NODE_ENV !== "test") startServer();


export default app;
