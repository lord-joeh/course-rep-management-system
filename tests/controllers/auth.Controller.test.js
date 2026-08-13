const { login } = require("../../controllers/auth.Controller");
const models = require("../../config/models");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const crypto = require("node:crypto");
const { handleError } = require("../../services/errorService");

// Mock dependencies
jest.mock("../../config/models", () => ({
  Student: {
    findByPk: jest.fn(),
  },
  RefreshToken: {
    upsert: jest.fn(),
  },
}));

jest.mock("../../services/errorService", () => ({
  handleError: jest.fn(),
}));

jest.mock("bcrypt", () => ({
  compare: jest.fn(),
}));

jest.mock("jsonwebtoken", () => ({
  sign: jest.fn(),
}));

jest.mock("node:crypto", () => ({
  randomBytes: jest.fn(),
}));

describe("Auth Controller - login", () => {
  let req, res;

  beforeEach(() => {
    jest.clearAllMocks();

    req = {
      body: {},
    };

    res = {
      cookie: jest.fn(),
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };

    process.env.JWT_SECRET = "test_secret";
  });

  it("should return 409 if studentId or password is missing", async () => {
    req.body = { studentId: "123" }; // Missing password

    await login(req, res);

    expect(handleError).toHaveBeenCalledWith(
      res,
      409,
      "Student ID and Password are required"
    );
  });

  it("should return 409 if password is missing but studentId is present", async () => {
    req.body = { password: "password" }; // Missing studentId

    await login(req, res);

    expect(handleError).toHaveBeenCalledWith(
      res,
      409,
      "Student ID and Password are required"
    );
  });

  it("should return 404 if student does not exist", async () => {
    req.body = { studentId: "123", password: "password" };
    models.Student.findByPk.mockResolvedValue(null);

    await login(req, res);

    expect(models.Student.findByPk).toHaveBeenCalledWith("123");
    expect(handleError).toHaveBeenCalledWith(
      res,
      404,
      "Student does not exist"
    );
  });

  it("should return 400 if invalid credentials", async () => {
    req.body = { studentId: "123", password: "wrong_password" };
    const mockStudent = { password_hash: "hashed_password" };
    models.Student.findByPk.mockResolvedValue(mockStudent);
    bcrypt.compare.mockResolvedValue(false);

    await login(req, res);

    expect(bcrypt.compare).toHaveBeenCalledWith(
      "wrong_password",
      "hashed_password"
    );
    expect(handleError).toHaveBeenCalledWith(res, 400, "Invalid credentials");
  });

  it("should successfully log in and return 200 with tokens", async () => {
    req.body = { studentId: "123", password: "correct_password" };

    const mockStudent = {
      id: "123",
      email: "test@test.com",
      isRep: false,
      password_hash: "hashed_password",
    };

    models.Student.findByPk.mockResolvedValue(mockStudent);
    bcrypt.compare.mockResolvedValue(true);
    jwt.sign.mockReturnValue("mock_access_token");

    const mockRandomBytes = { toString: jest.fn().mockReturnValue("mock_refresh_token") };
    crypto.randomBytes.mockReturnValue(mockRandomBytes);

    await login(req, res);

    expect(mockStudent.password_hash).toBeUndefined(); // Should clear password_hash
    expect(jwt.sign).toHaveBeenCalledWith(
      {
        id: "123",
        email: "test@test.com",
        isRep: false,
      },
      "test_secret",
      { expiresIn: "15m" }
    );

    expect(crypto.randomBytes).toHaveBeenCalledWith(64);
    expect(models.RefreshToken.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        student_id: "123",
        token: "mock_refresh_token",
        expires_at: expect.any(Date),
      })
    );

    expect(res.cookie).toHaveBeenCalledWith(
      "refreshToken",
      "mock_refresh_token",
      expect.objectContaining({
        httpOnly: true,
        sameSite: "strict",
        path: "/api/auth/refresh",
      })
    );

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      message: "Login successful",
      token: "mock_access_token",
      data: mockStudent,
    });
  });

  it("should return 500 if an error occurs during login", async () => {
    req.body = { studentId: "123", password: "password" };
    const error = new Error("Database error");
    models.Student.findByPk.mockRejectedValue(error);

    await login(req, res);

    expect(handleError).toHaveBeenCalledWith(
      res,
      500,
      "Error logging in",
      error
    );
  });
});
