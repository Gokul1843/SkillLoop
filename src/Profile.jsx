
import { useState } from "react";
import { UserRound, Camera } from "lucide-react";
import { updateProfile } from "firebase/auth";
import { doc, setDoc } from "firebase/firestore";
import { auth, db } from "./firebase/firebase";

export default function Profile({ user }) {
  const [displayName, setDisplayName] = useState(
    user?.displayName || ""
  );
  const [photoURL, setPhotoURL] = useState(user?.photoURL || "");
  const [selectedFile, setSelectedFile] = useState(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const compressImage = (file) =>
    new Promise((resolve, reject) => {
      const image = new Image();
      const objectURL = URL.createObjectURL(file);

      image.onload = () => {
        const canvas = document.createElement("canvas");
        const maxSize = 256;
        const scale = Math.min(
          maxSize / image.width,
          maxSize / image.height,
          1
        );

        canvas.width = Math.round(image.width * scale);
        canvas.height = Math.round(image.height * scale);

        const context = canvas.getContext("2d");
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        URL.revokeObjectURL(objectURL);

        canvas.toBlob(
          (blob) => {
            if (blob) resolve(blob);
            else reject(new Error("Image compression failed."));
          },
          "image/jpeg",
          0.65
        );
      };

      image.onerror = () => {
        URL.revokeObjectURL(objectURL);
        reject(new Error("Could not read this image."));
      };

      image.src = objectURL;
    });

  const saveProfile = async () => {
    if (!auth.currentUser || !user) return;

    const name = displayName.trim();

    if (!name) {
      setMessage("Please enter your display name.");
      return;
    }

    setSaving(true);
    setMessage("");

    try {
      let finalPhotoURL = photoURL;

      if (selectedFile) {
        if (!selectedFile.type.startsWith("image/")) {
          throw new Error("Please select an image file.");
        }

        const compressedBlob = await compressImage(selectedFile);

        if (compressedBlob.size > 200 * 1024) {
          throw new Error(
            "Image is still too large. Please select another photo."
          );
        }

        const base64 = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = () => reject(new Error("Could not read image."));
          reader.readAsDataURL(compressedBlob);
        });

        finalPhotoURL = base64;
      }

      await setDoc(
        doc(db, "users", user.uid),
        {
          displayName: name,
          photoURL: finalPhotoURL,
          email: user.email || "",
        },
        { merge: true }
      );

      if (!finalPhotoURL.startsWith("data:")) {
        await updateProfile(auth.currentUser, {
          displayName: name,
          photoURL: finalPhotoURL || null,
        });
      } else {
        await updateProfile(auth.currentUser, {
          displayName: name,
        });
      }

      setPhotoURL(finalPhotoURL);
      setSelectedFile(null);
      setMessage("Profile saved successfully! ✅");
    } catch (error) {
      console.error("Profile save error:", error);
      setMessage("Error: " + error.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="profile-page">
      <h2>My Profile</h2>

      <div className="profile-card">
        <div className="profile-avatar">
          {selectedFile || photoURL ? (
            <img
              src={
                selectedFile
                  ? URL.createObjectURL(selectedFile)
                  : photoURL
              }
              alt="Profile"
            />
          ) : (
            <UserRound size={50} />
          )}
        </div>

        <h3>{displayName || "Your Name"}</h3>
        <p>{user?.email || ""}</p>

        <label htmlFor="displayName">Display Name</label>
        <input
          id="displayName"
          type="text"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder="Enter your name"
          maxLength={50}
        />


        <label htmlFor="profilePhoto">Choose Profile Photo</label>
        <input
          id="profilePhoto"
          type="file"
          accept="image/*"
          onChange={(e) =>
            setSelectedFile(e.target.files?.[0] || null)
          }
        />


        <button
          type="button"
          onClick={saveProfile}
          disabled={saving}
        >
          <Camera size={16} />
          {saving ? "Saving..." : "Save Profile"}
        </button>

        {message && <p role="status">{message}</p>}
      </div>
    </div>
  );
}
