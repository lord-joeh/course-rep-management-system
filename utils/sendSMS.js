require("dotenv").config();
const axios = require("axios");

const sendSMS = async (to, message) => {
  try {
    const response = await axios.get(
      `${process.env.ARKESEL_BASE_URL}api_key=${process.env.ARKESEL_API_KEY}&to=${to}&from=${process.env.ARKESEL_SENDER_ID}&sms=${message}`
    );
    console.log(response.data);
    return response.data
  } catch (error) {
    console.error("Error sending SMS:", error.message);
    throw error
  }
};

module.exports = sendSMS
