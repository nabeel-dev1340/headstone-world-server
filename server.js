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
const { match } = require("assert");
const app = express();
const port = 3000;

const UPLOADS_DIR = "../Jobs/2023";
// const UPLOADS_DIR = "../jobs/2024";

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
            Name: "Headstone World",
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
// Define your CORS options
const corsOptions = {
  origin: "*",
  credentials: true, //access-control-allow-credentials:true
  optionSuccessStatus: 200,
};

app.use(cors(corsOptions)); // Use this after the variable declaration
// Middleware to parse JSON bodies
app.use(express.json());
// Middleware to parse URL-encoded bodies
app.use(express.urlencoded({ extended: true }));

// Login endpoint
app.post("/login", async (req, res) => {
  console.log("Hello");
  try {
    const { password } = req.body;
    console.log(password);

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
    const { headstoneName, invoiceNo, deposit } = req.body;

    // Sanitize the headstoneName to remove disallowed characters
    const sanitizedHeadstoneName = sanitizeForFTP(headstoneName);

    // Create a unique directory name
    const directoryName = `${sanitizedHeadstoneName.replace(
      / /g,
      "_"
    )}_${invoiceNo}`;
    // Create the directory if it doesn't exist
    const directoryPath = path.join(__dirname, UPLOADS_DIR, directoryName);
    if (!fs.existsSync(directoryPath)) {
      fs.mkdirSync(directoryPath);
    }

    // Determine the next available invoice file name
    let invoiceFileName = "invoice_v1.pdf";
    let fileIndex = 1;
    while (fs.existsSync(path.join(directoryPath, invoiceFileName))) {
      fileIndex++;
      invoiceFileName = `invoice_v${fileIndex}.pdf`;
    }

    // Set the file paths for saving
    const pdfFilePath = path.join(directoryPath, invoiceFileName);
    const jsonFilePath = path.join(directoryPath, "data.json");

    // Save the PDF file to the specified file path
    fs.writeFileSync(pdfFilePath, pdfBuffer);

    let dataToSave = {};

    // Check if data.json already exists
    if (fs.existsSync(jsonFilePath)) {
      // Read existing data from the file
      const existingData = fs.readFileSync(jsonFilePath, "utf8");
      dataToSave = JSON.parse(existingData);
    }

    // Check if 'deposits' field exists in req.body and is not empty
    if (deposit && deposit !== "") {
      const today = new Date().toISOString().split("T")[0];
      const newDeposit = {
        depositAmount: deposit,
        date: today,
      };

      // If 'deposits' array exists in existing data, append the new deposit
      if (dataToSave.hasOwnProperty("deposits")) {
        dataToSave.deposits.push(newDeposit);
      } else {
        // If 'deposits' array doesn't exist, initialize it with the new deposit
        dataToSave.deposits = [newDeposit];
      }
    }

    // Update other data if needed (e.g., 'data' from req.body)
    dataToSave.data = req.body;
    dataToSave.data.deposit = "";

    // Save updated data as a JSON file
    fs.writeFileSync(jsonFilePath, JSON.stringify(dataToSave, null, 2));

    // Respond with a success message
    res.status(200).json({ message: "PDF file and data saved successfully." });
  } catch (error) {
    console.error("Error while saving and uploading PDF:", error);

    // If there's an error, respond with a 500 status code
    res.status(500).json({ error: "Internal Server Error." });
  }
});

// Handle the /submit-to-cemetery endpoint
app.post("/submit-to-cemetery", upload.array("images"), async (req, res) => {
  try {
    const { headStoneName, invoiceNo } = req.body;
    const imageFiles = req.files; // Get an array of uploaded image files as Buffers

    // Create a unique directory name for Cemetery Submission
    const directoryName = `${headStoneName.replace(/ /g, "_")}_${invoiceNo}`;

    // Define the local directory paths
    const baseDirectory = path.join(__dirname, UPLOADS_DIR);
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
    } else {
      // Delete old images in the Cemetery_Submission directory
      const filesInCemeterySubmission = fs.readdirSync(
        cemeterySubmissionDirectory
      );
      filesInCemeterySubmission.forEach((file) => {
        const filePath = path.join(cemeterySubmissionDirectory, file);
        fs.unlinkSync(filePath);
      });
      console.log("Deleted old images in Cemetery_Submission directory.");
    }

    // Save uploaded images as files in the Cemetery Submission directory
    imageFiles.forEach((imageFile, index) => {
      // Determine the file extension based on the MIME type
      const extension = getFileExtension(imageFile.mimetype);

      // Generate a unique filename for each image (e.g., using a timestamp)
      const uniqueFileName = `${Date.now()}_${index}.${extension}`;
      const localImageFilePath = path.join(
        cemeterySubmissionDirectory,
        uniqueFileName
      );
      fs.writeFileSync(localImageFilePath, imageFile.buffer);
    });

    console.log("Images Saved.");

    // Add your email sending logic here if needed
    // RECIPIENTS["cemeteryApprovalGranite"].forEach(async function (email) {
    //   await sendMailjetEmail(
    //     email,
    //     `${headStoneName}: Prepare Cemetery Application`,
    //     ""
    //   );
    // });

    res.status(200).json({
      message: "Images saved and submitted to the cemetery successfully.",
    });
  } catch (error) {
    console.error("Error while submitting to the cemetery:", error);
    res.status(500).json({ error: "Internal Server Error." });
  }
});

function getFileExtension(mimeType) {
  console.log(mimeType);
  switch (mimeType) {
    // Image file types
    case "image/jpeg":
    case "image/pjpeg":
      return "jpg";
    case "image/png":
      return "png";
    case "image/gif":
      return "gif";
    case "image/svg+xml":
      return "svg";
    case "image/webp":
      return "webp";
    case "image/bmp":
      return "bmp";
    case "image/tiff":
      return "tiff";

    // Document file types
    case "application/pdf":
      return "pdf";
    case "application/msword":
      return "doc";
    case "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
      return "docx";
    case "application/vnd.ms-excel":
      return "xls";
    case "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":
      return "xlsx";
    case "application/vnd.ms-powerpoint":
      return "ppt";
    case "application/vnd.openxmlformats-officedocument.presentationml.presentation":
      return "pptx";
    case "application/rtf":
      return "rtf";
    case "application/vnd.oasis.opendocument.text":
      return "odt";

    // Text file type
    case "text/plain":
      return "txt";

    // Other file types
    case "application/octet-stream": // For .plt and other unknown types
      return "plt";

    default:
      return "unknown";
  }
}

// Define the /art-submission endpoint
app.post(
  "/art-submission",
  upload.array("finalArtImages"),
  async (req, res) => {
    try {
      const { headstoneName, invoiceNo, finalArtLength, cemeteryArtLength } =
        req.body;
      const finalArtImages = req.files;

      // Create a unique directory name for Art Submission
      const directoryName = `${headstoneName.replace(/ /g, "_")}_${invoiceNo}`;

      // Define the local directory paths
      const baseDirectory = path.join(__dirname, UPLOADS_DIR);
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
      } else {
        // Delete existing files in Final_Art directory
        const filesInFinalArt = fs.readdirSync(finalArtDirectory);
        filesInFinalArt.forEach((file) => {
          const filePath = path.join(finalArtDirectory, file);
          fs.unlinkSync(filePath);
        });

        // Delete existing files in Cemetery_Approval directory
        const filesInCemeteryApproval = fs.readdirSync(
          cemeteryApprovalDirectory
        );
        filesInCemeteryApproval.forEach((file) => {
          const filePath = path.join(cemeteryApprovalDirectory, file);
          fs.unlinkSync(filePath);
        });

        console.log(
          "Deleted old images in Final_Art and Cemetery_Approval directories."
        );
      }

      // Move uploaded images to the Final_Art directory
      for (let i = 0; i < finalArtLength; i++) {
        const image = finalArtImages[i];
        // Determine the file extension based on the MIME type
        const extension = getFileExtension(image.mimetype);
        // Generate a unique filename for each image (e.g., using a timestamp)
        const uniqueFileName = `${Date.now()}_${i}.${extension}`;
        const localImageFilePath = path.join(finalArtDirectory, uniqueFileName);
        fs.writeFileSync(localImageFilePath, image.buffer);
      }

      // Move uploaded images to the cemeter approval directory
      for (let i = finalArtLength; i < finalArtImages.length; i++) {
        const image = finalArtImages[i];
        // Determine the file extension based on the MIME type
        const extension = getFileExtension(image.mimetype);
        // Generate a unique filename for each image (e.g., using a timestamp)
        const uniqueFileName = `${Date.now()}_${i}.${extension}`;
        const localImageFilePath = path.join(
          cemeteryApprovalDirectory,
          uniqueFileName
        );
        fs.writeFileSync(localImageFilePath, image.buffer);
      }

      console.log("Images Saved.");
      // Add your email sending logic here if needed
      // RECIPIENTS["cemeteryApprovalEngraving"].forEach(async function (email) {
      //   await sendMailjetEmail(
      //     email,
      //     `${headstoneName}: Ready for engraving`,
      //     ""
      //   );
      // });

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
  upload.array("engravingImages"),
  async (req, res) => {
    try {
      const { headstoneName, invoiceNo } = req.body;
      const engravingImages = req.files;

      // Create a unique directory name for Engraving Submission
      const directoryName = `${headstoneName.replace(/ /g, "_")}_${invoiceNo}`;

      // Define the local directory paths
      const baseDirectory = path.join(__dirname, UPLOADS_DIR);
      const engravingSubmissionDirectory = path.join(
        baseDirectory,
        directoryName,
        "Work_Order",
        "Engraving_Submission"
      );

      // Create the Engraving_Submission directory
      if (!fs.existsSync(engravingSubmissionDirectory)) {
        fs.mkdirSync(engravingSubmissionDirectory, { recursive: true });
      } else {
        // Delete existing files in the Engraving_Submission directory
        const filesInEngravingSubmission = fs.readdirSync(
          engravingSubmissionDirectory
        );
        filesInEngravingSubmission.forEach((file) => {
          const filePath = path.join(engravingSubmissionDirectory, file);
          fs.unlinkSync(filePath);
        });

        console.log("Deleted old images in Engraving_Submission directory.");
      }

      // Save multiple engraving images
      engravingImages.forEach((engravingImage, index) => {
        const extension = getFileExtension(engravingImage.mimetype);
        const uniqueFileName = `${Date.now()}_${index}.${extension}`;
        const localImageFilePath = path.join(
          engravingSubmissionDirectory,
          uniqueFileName
        );
        fs.writeFileSync(localImageFilePath, engravingImage.buffer);
      });

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
      const {
        headstoneName,
        invoiceNo,
        foundationImagesLength,
        monumentImagesLength,
      } = req.body;
      const foundationInstallImages = req.files;

      // Create a unique directory name for Foundation Submission
      const directoryName = `${headstoneName.replace(/ /g, "_")}_${invoiceNo}`;

      // Define the local directory paths
      const baseDirectory = path.join(__dirname, UPLOADS_DIR);
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
      } else {
        // Delete existing files in Foundation_Install directory
        const filesInFoundationInstall = fs.readdirSync(
          foundationInstallDirectory
        );
        filesInFoundationInstall.forEach((file) => {
          const filePath = path.join(foundationInstallDirectory, file);
          fs.unlinkSync(filePath);
        });

        // Delete existing files in Monument_Setting directory
        const filesInMonumentSetting = fs.readdirSync(monumentSettingDirectory);
        filesInMonumentSetting.forEach((file) => {
          const filePath = path.join(monumentSettingDirectory, file);
          fs.unlinkSync(filePath);
        });

        console.log(
          "Deleted old images in Foundation_Install and Monument_Setting directories."
        );
      }

      // Move uploaded images to the Foundation_Install directory
      for (let i = 0; i < foundationImagesLength; i++) {
        const image = foundationInstallImages[i];
        // Determine the file extension based on the MIME type
        const extension = getFileExtension(image.mimetype);
        // Generate a unique filename for each image (e.g., using a timestamp)
        const uniqueFileName = `${Date.now()}_${i}.${extension}`;
        const localImageFilePath = path.join(
          foundationInstallDirectory,
          uniqueFileName
        );
        fs.writeFileSync(localImageFilePath, image.buffer);
      }

      // Move uploaded images to the Monument Setting directory
      for (
        let i = foundationImagesLength;
        i < foundationInstallImages.length;
        i++
      ) {
        const image = foundationInstallImages[i];
        // Determine the file extension based on the MIME type
        const extension = getFileExtension(image.mimetype);
        // Generate a unique filename for each image (e.g., using a timestamp)
        const uniqueFileName = `${Date.now()}_${i}.${extension}`;
        const localImageFilePath = path.join(
          monumentSettingDirectory,
          uniqueFileName
        );
        fs.writeFileSync(localImageFilePath, image.buffer);
      }
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

// endpoint to save work order and req.body as data.json
app.post("/work-order", upload.single("workOrder"), async (req, res) => {
  try {
    const workOrder = req.file;
    const data = req.body;
    const { headStoneName, invoiceNo } = req.body;

    // Create a unique directory name for Cemetery Submission
    const directoryName = `${headStoneName.replace(/ /g, "_")}_${invoiceNo}`;
    const baseDirectory = path.join(__dirname, UPLOADS_DIR);
    const workOrderDirectory = path.join(
      baseDirectory,
      directoryName,
      "Work_Order"
    );

    // Create Work_Order directory if it doesn't exist
    if (!fs.existsSync(workOrderDirectory)) {
      fs.mkdirSync(workOrderDirectory, { recursive: true });
    }

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
    const engravingSubmissionDirectory = path.join(
      baseDirectory,
      directoryName,
      "Work_Order",
      "Engraving_Submission"
    );
    const cemeterySubmissionDirectory = path.join(
      baseDirectory,
      directoryName,
      "Work_Order",
      "Cemetery_Submission"
    );
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
    // Create other directories
    if (!fs.existsSync(cemeterySubmissionDirectory)) {
      fs.mkdirSync(cemeterySubmissionDirectory, { recursive: true });
    }
    if (!fs.existsSync(foundationInstallDirectory)) {
      fs.mkdirSync(foundationInstallDirectory, { recursive: true });
    }
    if (!fs.existsSync(monumentSettingDirectory)) {
      fs.mkdirSync(monumentSettingDirectory, { recursive: true });
    }
    if (!fs.existsSync(engravingSubmissionDirectory)) {
      fs.mkdirSync(engravingSubmissionDirectory, { recursive: true });
    }
    if (!fs.existsSync(artSubmissionDirectory)) {
      fs.mkdirSync(artSubmissionDirectory, { recursive: true });
    }
    if (!fs.existsSync(finalArtDirectory)) {
      fs.mkdirSync(finalArtDirectory, { recursive: true });
    }
    if (!fs.existsSync(cemeteryApprovalDirectory)) {
      fs.mkdirSync(cemeteryApprovalDirectory, { recursive: true });
    }

    // Determine the next available work order file name
    let workOrderFileName = "work_order_v1.png";
    let fileIndex = 1;
    while (fs.existsSync(path.join(workOrderDirectory, workOrderFileName))) {
      fileIndex++;
      workOrderFileName = `work_order_v${fileIndex}.png`;
    }

    // Save the work order file with the determined file name
    const localFilePath = path.join(workOrderDirectory, workOrderFileName);
    fs.writeFileSync(localFilePath, workOrder.buffer);

    // Save req.body as data.json
    const dataFilePath = path.join(workOrderDirectory, "data.json");
    fs.writeFileSync(dataFilePath, JSON.stringify(data, null, 2));

    // Respond with a success message and a 200 status code
    res
      .status(200)
      .json({ message: "Work Order and data saved successfully!" });
  } catch (error) {
    console.error("Error processing Work Order:", error);

    // If there's an error, respond with a 500 status code
    res.status(500).json({ error: "Internal Server Error." });
  }
});

//get work orders
app.get("/work-orders", async (req, res) => {
  try {
    const headstoneName = req.query.headstoneName;

    if (!headstoneName) {
      return res
        .status(400)
        .json({ error: "Headstone name is required as a query parameter." });
    }

    // Define the uploads directory path
    const uploadsDirectory = path.join(__dirname, UPLOADS_DIR);

    // List all directory names inside the uploads directory
    const directoryNames = fs.readdirSync(uploadsDirectory);

    // Filter directories that match the headstoneName wildcard and contain "INV"
    const matchingDirectories = directoryNames.filter((directory) => {
      directory = directory.toLowerCase();
      directory = directory.replace(/_/g, " ");
      return (
        directory.includes("inv") &&
        directory.includes(headstoneName.toLowerCase())
      );
    });

    if (matchingDirectories.length > 0) {
      const matchingRecords = matchingDirectories.map((matchingDirectory) => {
        const splitName = matchingDirectory.split("INV");
        const nameOnHeadstone = splitName[0].replace(/_/g, " ");
        const invoiceNum = splitName[1].split("-")[1];

        if (match) {
          const extractedHeadstoneName = nameOnHeadstone;
          const extractedInvoiceNo = invoiceNum;

          return {
            headstoneName: extractedHeadstoneName,
            invoiceNo: extractedInvoiceNo,
          };
        } else {
          return {
            error: "Invalid directory name format",
          };
        }
      });

      res.status(200).json(matchingRecords);
    } else {
      res.status(404).json({ error: "No matching directories found." });
    }
  } catch (error) {
    res.status(500).json({ error: "Internal server error." });
  }
});

app.get("/invoice", async (req, res) => {
  try {
    // Extract the invoiceNo from query parameters
    const { invoiceNo } = req.query;
    console.log(invoiceNo);

    // Define the uploads directory path
    const uploadsDirectory = path.join(__dirname, UPLOADS_DIR);

    // List all directory names inside the uploads directory
    const directoryNames = fs.readdirSync(uploadsDirectory);

    // Find a directory whose name matches the invoiceNo
    const matchingDirectory = directoryNames.find((directoryName) =>
      directoryName.includes(invoiceNo)
    );
    console.log(matchingDirectory);

    if (!matchingDirectory) {
      return res.status(404).json({ error: "Invoice not found" });
    }

    // Get the data from the data.json file in the matching directory
    const dataFilePath = path.join(
      uploadsDirectory,
      matchingDirectory,
      "data.json"
    );
    const data = fs.readFileSync(dataFilePath, "utf8");
    console.log(data);

    // Parse the JSON data
    const invoiceData = JSON.parse(data);

    // Send the invoice data as the response
    res.status(200).json(invoiceData);
  } catch (error) {
    console.error("Error fetching invoice data:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

app.get("/work-order", async (req, res) => {
  try {
    const invoiceNo = req.query.invoiceNo;

    if (!invoiceNo) {
      return res
        .status(400)
        .json({ error: "Invoice number is required as a query parameter." });
    }

    const baseDirectory = path.join(__dirname, UPLOADS_DIR);
    const directoryNames = await fs.promises.readdir(baseDirectory);
    const matchingDirectory = directoryNames.find((directoryName) =>
      directoryName.includes(invoiceNo)
    );

    if (!matchingDirectory) {
      return res.status(404).json({ error: "Matching directory not found." });
    }

    const matchingDirectoryPath = path.join(baseDirectory, matchingDirectory);
    const dataJsonFilePath = path.join(
      matchingDirectoryPath,
      "Work_Order",
      "data.json"
    );

    // Work order is not created
    if (!fs.existsSync(dataJsonFilePath)) {
      const invoiceDataFilePath = path.join(matchingDirectoryPath, "data.json");
      const jsonContent = await fs.promises.readFile(
        invoiceDataFilePath,
        "utf-8"
      );
      const jsonData = JSON.parse(jsonContent);
      const dataToUse = jsonData.data;
      return res.status(404).json({
        data: {
          headStoneName: dataToUse.headstoneName,
          invoiceNo: dataToUse.invoiceNo,
          date: dataToUse.date,
          customerEmail: dataToUse.customerEmail,
          customerName: dataToUse.customerName,
          customerPhone: dataToUse.customerPhone,
          cemeteryName: dataToUse.cemeteryName,
          cemeteryAddress: dataToUse.cemeteryAddress,
          cemeteryContact: dataToUse.cemeteryContact,
          lotNumber: dataToUse.lotNumber,
        },
      });
    }

    const dataJsonContent = await fs.promises.readFile(
      dataJsonFilePath,
      "utf-8"
    );
    const jsonData = JSON.parse(dataJsonContent);
    const imageTypes = {
      jpg: "jpeg",
      jpeg: "jpeg",
      png: "png",
      gif: "gif",
    };

    const convertImageToBase64 = async (imagePath) => {
      const imageData = await fs.promises.readFile(imagePath);
      const imageType = path.extname(imagePath).slice(1);
      const dataUriPrefix = `data:image/${
        imageTypes[imageType] || "jpeg"
      };base64,`;
      return dataUriPrefix + imageData.toString("base64");
    };

    const getImageArray = async (imagePath) => {
      const stats = await fs.promises.stat(imagePath);

      if (stats.isDirectory()) {
        const imageFileNames = await fs.promises.readdir(imagePath);
        const promises = imageFileNames.map(async (imageName) => {
          const imageFilePath = path.join(imagePath, imageName); // Use a different variable name here
          return {
            fileName: imageName,
            base64Data: await convertImageToBase64(imageFilePath), // Use the new variable name here
          };
        });
        return Promise.all(promises);
      }
      return [];
    };

    const tasks = [
      getImageArray(
        path.join(matchingDirectoryPath, "Work_Order", "Cemetery_Submission")
      ),
      getImageArray(
        path.join(matchingDirectoryPath, "Work_Order", "Engraving_Submission")
      ),
      getImageArray(
        path.join(matchingDirectoryPath, "Work_Order", "Foundation_Install")
      ),
      getImageArray(
        path.join(matchingDirectoryPath, "Work_Order", "Monument_Setting")
      ),
      getImageArray(
        path.join(
          matchingDirectoryPath,
          "Work_Order",
          "Art_Submission",
          "Cemetery_Approval"
        )
      ),
      getImageArray(
        path.join(
          matchingDirectoryPath,
          "Work_Order",
          "Art_Submission",
          "Final_Art"
        )
      ),
    ];

    const [
      cemeterySubmission,
      engravingSubmission,
      foundationInstall,
      monumentSetting,
      cemeteryApproval,
      finalArt,
    ] = await Promise.all(tasks);

    jsonData.cemeterySubmission = cemeterySubmission;
    jsonData.engravingSubmission = engravingSubmission;
    jsonData.foundationInstall = foundationInstall;
    jsonData.monumentSetting = monumentSetting;
    jsonData.cemeteryApproval = cemeteryApproval;
    jsonData.finalArt = finalArt;

    res.status(200).json(jsonData);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal server error." });
  }
});

app.listen(port, () => {
  console.log(`Server is listening on port ${port}`);
});
