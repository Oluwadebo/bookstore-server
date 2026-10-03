/** Store-wide settings the owner can change from the admin area (key/value). */
import mongoose from "mongoose";

const settingSchema = new mongoose.Schema({ key: { type: String, required: true, unique: true }, value: mongoose.Schema.Types.Mixed }, { timestamps: true });

export const Setting = mongoose.model("Setting", settingSchema);
