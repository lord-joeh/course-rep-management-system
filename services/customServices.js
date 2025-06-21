const { format, parse } = require('date-fns');
const { randomInt } = require('crypto');
const qrCode = require('qrcode');

// Function to format date and time
exports.formatDateAndTime = (dateStr, timeStr) => {
  const parsedDate = parse(dateStr, 'do MMMM, yyyy', new Date());

  const parsedTime = parse(timeStr, 'hh:mm a', new Date());

  return {
    formattedDate: format(parsedDate, 'yyyy-MM-dd'),
    formattedTime: format(parsedTime, 'HH:mm:ss') + '+01',
  };
};

exports.formatDate = (dateStr) => {
  try {
    // Parse date string (e.g., "6th June, 2025")
    const parsedDate = parse(dateStr, 'do MMMM, yyyy', new Date());
    return format(parsedDate, 'yyyy-MM-dd');
  } catch (error) {
    throw new Error('Invalid date format. Expected format: "6th June, 2025"');
  }
};

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
  const generatedId = await randomInt(1000, 9999);
  return `${short}${generatedId}`;
};

//Function to generate qr code
exports.generateQR = async (url) => {
  return await qrCode.toDataURL(url)
};
