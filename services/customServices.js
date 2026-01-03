const { v4 } = require("uuid");
const qrCode = require("qrcode");

//Algorithm for array shuffle
exports.shuffle = (array) => {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
};

//Function generate ids
exports.generatedId = async (short) => {
  return v4();
};

//Function to generate qr code
exports.generateQR = async (url) => {
  return await qrCode.toDataURL(url);
};
