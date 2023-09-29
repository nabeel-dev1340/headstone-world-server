const express = require("express");
const bodyParser = require("body-parser");
const multer = require("multer");
const cors = require("cors");
const { config } = require("dotenv");
const path = require("path");
const { PASSWORDS } = require("./data/users");
const { RECIPIENTS } = require("./data/recipients");
const fs = require("fs");
const Mailjet = require("node-mailjet");
const app = express();
const port = 3000;

// Load environment variables from .env file
config();

const mailjet = Mailjet.apiConnect(
  process.env.MJ_APIKEY_PUBLIC,
  process.env.MJ_APIKEY_PRIVATE,
  {
    config: {},
    options: {},
  }
);

// Function to send an email using Mailjet
async function sendMailjetEmail(toEmail, subject, text) {
  const request = mailjet.post("send", { version: "v3.1" }).request({
    Messages: [
      {
        From: {
          Email: RECIPIENTS["from"],
          Name: "Headstone World",
        },
        To: [
          {
            Email: toEmail,
            Name: "Syed Nabeel",
          },
        ],
        Subject: subject,
        TextPart: "From Headstone World",
      },
    ],
  });

  request
    .then((result) => {
      console.log("Email sent:", result.body);
    })
    .catch((err) => {
      console.log(err.statusCode);
    });
}

// Sanitize a string to remove characters not allowed in FTP names
function sanitizeForFTP(name) {
  return name.replace(/[^a-zA-Z0-9_]/g, "_");
}

// Define the storage for uploaded PDFs
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

app.use(bodyParser.json());
// Enable CORS for all routes
app.use(cors());

// Login endpoint
app.post("/login", async (req, res) => {
  try {
    const { password } = req.body;

    if (!password) {
      return res.status(400).json({ message: "Password is required" });
    }

    if (PASSWORDS.includes(password)) {
      // Authentication successful
      res.status(200).json({ message: "Authentication successful" });
    } else {
      return res.status(401).json({ message: "Incorrect Password" });
    }
  } catch (error) {
    console.error("Error authenticating user:", error);
    res.status(500).json({ message: "Authentication failed" });
  }
});

app.get("/hello", (req, res) => {
  res.json({ message: "Hello" });
});

app.post("/save-invoice", upload.single("pdf"), async (req, res) => {
  try {
    const pdfBuffer = req.file.buffer;
    const { headstoneName, invoiceNo } = req.body;

    // Sanitize the headstoneName to remove disallowed characters
    const sanitizedHeadstoneName = sanitizeForFTP(headstoneName);

    // Create a unique directory name
    const directoryName = `${sanitizedHeadstoneName.replace(
      / /g,
      "_"
    )}_${invoiceNo}`;

    // Create the directory if it doesn't exist
    const directoryPath = path.join(__dirname, "uploads", directoryName);
    if (!fs.existsSync(directoryPath)) {
      fs.mkdirSync(directoryPath);
    }
    // Set the file path for saving
    const filePath = path.join(directoryPath, `${req.file.originalname}`);

    // save file to filepath
    // Save the PDF file to the specified file path
    fs.writeFileSync(filePath, pdfBuffer);
    // Respond with a success message
    res
      .status(200)
      .json({ message: "PDF file uploaded and saved successfully." });
  } catch (error) {
    console.error("Error while saving and uploading PDF:", error);

    // If there's an error, respond with a 500 status code
    res.status(500).json({ error: "Internal Server Error." });
  }
});

// Handle the /submit-to-cemetery endpoint
app.post(
  "/submit-to-cemetery",
  upload.array("images", 10),
  async (req, res) => {
    try {
      const { headStoneName, invoiceNo } = req.body;
      // Create a unique directory name for Cemetery Submission
      const directoryName = `${headStoneName.replace(/ /g, "_")}_${invoiceNo}`;

      // Define the local directory paths
      const baseDirectory = path.join(__dirname, "uploads");
      const workOrderDirectory = path.join(
        baseDirectory,
        directoryName,
        "Work_Order"
      );
      const cemeterySubmissionDirectory = path.join(
        workOrderDirectory,
        "Cemetery_Submission"
      );

      // Create Work_Order and Cemetery_Submission directories
      if (!fs.existsSync(workOrderDirectory)) {
        fs.mkdirSync(workOrderDirectory, { recursive: true });
      }
      if (!fs.existsSync(cemeterySubmissionDirectory)) {
        fs.mkdirSync(cemeterySubmissionDirectory, { recursive: true });
      }

      // Move uploaded images to the Cemetery Submission directory
      for (const file of req.files) {
        const localImageFilePath = path.join(
          cemeterySubmissionDirectory,
          file.originalname
        );
        fs.writeFileSync(localImageFilePath, file.buffer);
      }

      console.log("Images Saved.");
      // RECIPIENTS["cemeteryApprovalGranite"].forEach(async function (email) {
      //   await sendMailjetEmail(
      //     email,
      //     `${headStoneName}: Prepare cemetery application`,
      //     ""
      //   );
      // });
      // RECIPIENTS["cemeteryApprovalEngraving"].forEach(async function (email) {
      //   await sendMailjetEmail(
      //     email,
      //     `${headStoneName}: Ready for engraving`,
      //     ""
      //   );
      // });
      sendMailjetEmail(
        "nabeelnibbi938883@gmail.com",
        `${headStoneName}: Prepare cemetery application`,
        ""
      );
      res.status(200).json({
        message: "Images saved and submitted to cemetery successfully.",
      });
    } catch (error) {
      console.error("Error while submitting to cemetery:", error);
      res.status(500).json({ error: "Internal Server Error." });
    }
  }
);

// Define the /art-submission endpoint
app.post(
  "/art-submission",
  upload.array("finalArtImages"),
  async (req, res) => {
    try {
      const { headstoneName, invoiceNo } = req.body;
      const finalArtImages = req.files;

      // Create a unique directory name for Art Submission
      const directoryName = `${headstoneName.replace(/ /g, "_")}_${invoiceNo}`;

      // Define the local directory paths
      const baseDirectory = path.join(__dirname, "uploads");
      const artSubmissionDirectory = path.join(
        baseDirectory,
        directoryName,
        "Work_Order",
        "Art_Submission"
      );
      const finalArtDirectory = path.join(artSubmissionDirectory, "Final_Art");
      const cemeteryApprovalDirectory = path.join(
        artSubmissionDirectory,
        "Cemetery_Approval"
      );

      // Create directories
      if (!fs.existsSync(artSubmissionDirectory)) {
        fs.mkdirSync(artSubmissionDirectory, { recursive: true });
      }
      if (!fs.existsSync(finalArtDirectory)) {
        fs.mkdirSync(finalArtDirectory, { recursive: true });
      }
      if (!fs.existsSync(cemeteryApprovalDirectory)) {
        fs.mkdirSync(cemeteryApprovalDirectory, { recursive: true });
      }

      // Move uploaded images to the Final_Art directory
      for (let i = 0; i < finalArtImages.length - 1; i++) {
        const image = finalArtImages[i];
        const localImageFilePath = path.join(
          finalArtDirectory,
          image.originalname
        );
        fs.writeFileSync(localImageFilePath, image.buffer);
      }

      // Save Cemetery Approval image
      const cemeteryApprovalImage = finalArtImages[finalArtImages.length - 1];
      const cemeteryApprovalFilePath = path.join(
        cemeteryApprovalDirectory,
        cemeteryApprovalImage.originalname
      );
      fs.writeFileSync(cemeteryApprovalFilePath, cemeteryApprovalImage.buffer);

      console.log("Images Saved.");
      // Respond with a success message and a 200 status code
      res.status(200).json({ message: "Art submission successful!" });
    } catch (error) {
      console.error("Error processing art submission:", error);

      // If there's an error, respond with a 500 status code
      res.status(500).json({ error: "Internal Server Error." });
    }
  }
);

// endpoint for engraving
app.post(
  "/engraving-submission",
  upload.single("engravingImage"),
  async (req, res) => {
    try {
      const { headstoneName, invoiceNo } = req.body;
      const engravingImage = req.file;

      // Create a unique directory name for Engraving Submission
      const directoryName = `${headstoneName.replace(/ /g, "_")}_${invoiceNo}`;

      // Define the local directory paths
      const baseDirectory = path.join(__dirname, "uploads");
      const engravingSubmissionDirectory = path.join(
        baseDirectory,
        directoryName,
        "Work_Order",
        "Engraving_Submission"
      );

      // Create the Engraving_Submission directory
      if (!fs.existsSync(engravingSubmissionDirectory)) {
        fs.mkdirSync(engravingSubmissionDirectory, { recursive: true });
      }

      // Save the engraving image
      const localImageFilePath = path.join(
        engravingSubmissionDirectory,
        engravingImage.originalname
      );
      fs.writeFileSync(localImageFilePath, engravingImage.buffer);

      console.log("Images Saved.");
      // RECIPIENTS["engravingPhoto"].forEach(async function (email) {
      //   await sendMailjetEmail(email, `${headStoneName}: Monument Install`, "");
      // });
      // Respond with a success message and a 200 status code
      res.status(200).json({ message: "Engraving submission successful!" });
    } catch (error) {
      console.error("Error processing engraving submission:", error);

      // If there's an error, respond with a 500 status code
      res.status(500).json({ error: "Internal Server Error." });
    }
  }
);

// Define the /foundation-submission endpoint
app.post(
  "/foundation-submission",
  upload.array("foundationInstallImages"),
  async (req, res) => {
    try {
      const { headstoneName, invoiceNo } = req.body;
      const foundationInstallImages = req.files;

      // Create a unique directory name for Foundation Submission
      const directoryName = `${headstoneName.replace(/ /g, "_")}_${invoiceNo}`;

      // Define the local directory paths
      const baseDirectory = path.join(__dirname, "uploads");
      const foundationInstallDirectory = path.join(
        baseDirectory,
        directoryName,
        "Work_Order",
        "Foundation_Install"
      );
      const monumentSettingDirectory = path.join(
        baseDirectory,
        directoryName,
        "Work_Order",
        "Monument_Setting"
      );

      // Create directories
      if (!fs.existsSync(foundationInstallDirectory)) {
        fs.mkdirSync(foundationInstallDirectory, { recursive: true });
      }
      if (!fs.existsSync(monumentSettingDirectory)) {
        fs.mkdirSync(monumentSettingDirectory, { recursive: true });
      }

      // Move uploaded images to the Foundation_Install directory
      for (let i = 0; i < foundationInstallImages.length - 1; i++) {
        const image = foundationInstallImages[i];
        const localImageFilePath = path.join(
          foundationInstallDirectory,
          image.originalname
        );
        fs.writeFileSync(localImageFilePath, image.buffer);
      }

      // Save the monument setting image
      const monumentSettingImage =
        foundationInstallImages[foundationInstallImages.length - 1];
      const monumentSettingFilePath = path.join(
        monumentSettingDirectory,
        monumentSettingImage.originalname
      );
      fs.writeFileSync(monumentSettingFilePath, monumentSettingImage.buffer);
      // RECIPIENTS["monumentSetting"].forEach(async function (email) {
      //   await sendMailjetEmail(email, `${headstoneName}: Monument Install`, "");
      // });
      // Respond with a success message and a 200 status code
      res
        .status(200)
        .json({ message: "Foundation/Setting submission successful!" });
    } catch (error) {
      console.error("Error processing Foundation/Setting submission:", error);

      // If there's an error, respond with a 500 status code
      res.status(500).json({ error: "Internal Server Error." });
    }
  }
);

// endpoint to save work order
app.post("/work-order", upload.single("workOrder"), async (req, res) => {
  try {
    const { invoiceNo } = req.body;
    const workOrder = req.file;

    // Define the local directory paths
    const baseDirectory = path.join(__dirname, "uploads", "Work Orders");

    // Create the directory if it doesn't exist
    if (!fs.existsSync(baseDirectory)) {
      fs.mkdirSync(baseDirectory, { recursive: true });
    }

    // Save the work order file
    const localFilePath = path.join(baseDirectory, workOrder.originalname);
    fs.writeFileSync(localFilePath, workOrder.buffer);

    // Respond with a success message and a 200 status code
    res.status(200).json({ message: "Work Order saved successfully!" });
  } catch (error) {
    console.error("Error processing Work Order:", error);

    // If there's an error, respond with a 500 status code
    res.status(500).json({ error: "Internal Server Error." });
  }
});

app.listen(port, () => {
  console.log(`Server is listening on port ${port}`);
});
