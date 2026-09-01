const axios = require('axios');
const sendSMS = require('../utils/sendSMS');

jest.mock('axios');

describe('sendSMS', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules(); // clears the cache
    process.env = {
      ...originalEnv,
      ARKESEL_BASE_URL: 'https://api.arkesel.com/sms/api?',
      ARKESEL_API_KEY: 'test-api-key',
      ARKESEL_SENDER_ID: 'TEST-SENDER'
    };

    // Mock console.log and console.error
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    process.env = originalEnv; // Restore old environment
    jest.restoreAllMocks();
  });

  it('should send SMS successfully and return response data', async () => {
    const mockResponse = { data: { code: '100', message: 'Success' } };
    axios.get.mockResolvedValueOnce(mockResponse);

    const to = '0241234567';
    const message = 'Hello, this is a test message.';

    const result = await sendSMS(to, message);

    expect(axios.get).toHaveBeenCalledWith(
      `https://api.arkesel.com/sms/api?api_key=test-api-key&to=0241234567&from=TEST-SENDER&sms=Hello, this is a test message.`
    );
    expect(console.log).toHaveBeenCalledWith(mockResponse.data);
    expect(result).toEqual(mockResponse.data);
  });

  it('should handle errors when sending SMS fails', async () => {
    const mockError = new Error('Network Error');
    axios.get.mockRejectedValueOnce(mockError);

    const to = '0241234567';
    const message = 'Hello, this is a test message.';

    await expect(sendSMS(to, message)).rejects.toThrow('Network Error');

    expect(console.error).toHaveBeenCalledWith('Error sending SMS:', 'Network Error');
  });
});
