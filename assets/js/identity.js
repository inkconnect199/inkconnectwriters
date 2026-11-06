/* Identity-document image preparation shared by registration and resubmission. */
const IdentityVerification = {
  async prepareDocument(file) {
    if (!file || !["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      throw new Error("Choose a JPG, PNG, or WebP image.");
    }
    if (file.size > 12 * 1024 * 1024) throw new Error("Each original image must be smaller than 12 MB.");

    const source = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error("Could not read this image. Choose another file."));
        image.src = reader.result;
      };
      reader.onerror = () => reject(new Error("Could not read this image. Choose another file."));
      reader.readAsDataURL(file);
    });

    const maxDimension = 1800;
    const scale = Math.min(1, maxDimension / Math.max(source.naturalWidth, source.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(source.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(source.naturalHeight * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Could not process this image. Choose another file.");
    context.drawImage(source, 0, 0, canvas.width, canvas.height);

    for (const quality of [0.86, 0.76, 0.66, 0.56, 0.46]) {
      const dataUrl = canvas.toDataURL("image/jpeg", quality);
      if (dataUrl.length <= 900000) return dataUrl;
    }
    throw new Error("This image is too large to upload. Choose a smaller or clearer photo.");
  },

  async collect(root, includeConsent) {
    const name = root.querySelector("[data-identity-name]").value.trim();
    const documentType = root.querySelector("[data-identity-type]").value;
    const number = root.querySelector("[data-identity-number]").value.trim();
    const frontFile = root.querySelector("[data-identity-front]").files[0];
    const backFile = root.querySelector("[data-identity-back]").files[0];
    if (name.length < 2) throw new Error("Enter the full name printed on your ID.");
    if (!["national_id", "drivers_license"].includes(documentType)) throw new Error("Choose a valid ID document type.");
    if (number.length < 4 || number.length > 40) throw new Error("Enter a valid ID or license number.");
    if (includeConsent && !root.querySelector("[data-identity-consent]").checked) {
      throw new Error("Consent is required before submitting ID documents.");
    }
    if (!frontFile || !backFile) throw new Error("Upload clear images of both the front and back of your document.");

    const [front, back] = await Promise.all([
      this.prepareDocument(frontFile),
      this.prepareDocument(backFile),
    ]);
    return {
      name,
      documentType,
      number,
      front,
      back,
      consent: includeConsent,
    };
  },
};
