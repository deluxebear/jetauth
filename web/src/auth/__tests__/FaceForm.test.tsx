import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import FaceForm from "../signin/FaceForm";

// Mock i18n
vi.mock("../../i18n", () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

// Mock API client
const mockApiPost = vi.fn();
vi.mock("../../api/client", () => ({
  api: {
    post: (...args: unknown[]) => mockApiPost(...args),
  },
}));

// getUserMedia mock — set up per-test via mockGetUserMedia
const mockGetUserMedia = vi.fn();
Object.defineProperty(navigator, "mediaDevices", {
  writable: true,
  value: { getUserMedia: mockGetUserMedia },
});

// Minimal fake MediaStream
function makeFakeStream() {
  const stop = vi.fn();
  return {
    getTracks: () => [{ stop }],
    _stop: stop,
  } as unknown as MediaStream;
}

const defaultProps = {
  identifier: "alice@example.com",
  userHint: "a***@example.com",
  application: "myapp",
  organization: "myorg",
  onSuccess: vi.fn(),
  onBack: vi.fn(),
};

// Silence HTMLVideoElement.play() not implemented in happy-dom
beforeEach(() => {
  vi.clearAllMocks();
  Object.defineProperty(HTMLVideoElement.prototype, "play", {
    configurable: true,
    writable: true,
    value: vi.fn().mockResolvedValue(undefined),
  });
});

describe("FaceForm", () => {
  it("shows cameraError message when getUserMedia is denied", async () => {
    mockGetUserMedia.mockRejectedValue(new DOMException("denied", "NotAllowedError"));

    render(<FaceForm {...defaultProps} />);

    await waitFor(() =>
      expect(screen.getByText("auth.face.cameraError")).toBeInTheDocument(),
    );
  });

  it("shows Capture button when camera is allowed", async () => {
    const stream = makeFakeStream();
    mockGetUserMedia.mockResolvedValue(stream);

    render(<FaceForm {...defaultProps} />);

    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /auth\.face\.button/i }),
      ).toBeInTheDocument(),
    );
  });

  it("calls api.post with correct faceIdImage body shape on Capture click", async () => {
    const stream = makeFakeStream();
    mockGetUserMedia.mockResolvedValue(stream);
    mockApiPost.mockResolvedValue({ status: "ok" });

    // Stub canvas.toDataURL to avoid DOM errors in happy-dom
    const fakeDataUrl = "data:image/png;base64,FAKE";
    const origGetContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue({
      drawImage: vi.fn(),
    }) as unknown as typeof origGetContext;
    const origToDataURL = HTMLCanvasElement.prototype.toDataURL;
    HTMLCanvasElement.prototype.toDataURL = vi.fn().mockReturnValue(fakeDataUrl);

    const onSuccess = vi.fn();
    render(<FaceForm {...defaultProps} onSuccess={onSuccess} />);

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /auth\.face\.button/i })).toBeInTheDocument(),
    );

    fireEvent.click(screen.getByRole("button", { name: /auth\.face\.button/i }));

    await waitFor(() => expect(onSuccess).toHaveBeenCalled());

    expect(mockApiPost).toHaveBeenCalledWith(
      "/api/login",
      expect.objectContaining({
        application: "myapp",
        organization: "myorg",
        username: "alice@example.com",
        type: "login",
        signinMethod: "Face ID",
        faceIdImage: [fakeDataUrl],
        clientId: "myapp",
      }),
    );

    // Restore
    HTMLCanvasElement.prototype.getContext = origGetContext;
    HTMLCanvasElement.prototype.toDataURL = origToDataURL;
  });

  it("shows failed message and retry button when backend returns error", async () => {
    const stream = makeFakeStream();
    mockGetUserMedia.mockResolvedValue(stream);
    mockApiPost.mockResolvedValue({ status: "error", msg: "auth.face.failed" });

    HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue({
      drawImage: vi.fn(),
    }) as unknown as typeof HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.toDataURL = vi.fn().mockReturnValue("data:image/png;base64,X");

    render(<FaceForm {...defaultProps} />);

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /auth\.face\.button/i })).toBeInTheDocument(),
    );

    fireEvent.click(screen.getByRole("button", { name: /auth\.face\.button/i }));

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /auth\.face\.retry/i })).toBeInTheDocument(),
    );

    expect(screen.getByText("auth.face.failed")).toBeInTheDocument();
  });

  it("calls onBack and stops tracks when back button is clicked", async () => {
    const stream = makeFakeStream();
    const stopSpy = stream.getTracks()[0].stop;
    mockGetUserMedia.mockResolvedValue(stream);

    const onBack = vi.fn();
    render(<FaceForm {...defaultProps} onBack={onBack} />);

    // Wait until the camera is live (Capture button visible) so the stream is set
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /auth\.face\.button/i })).toBeInTheDocument(),
    );

    fireEvent.click(screen.getByRole("button", { name: "auth.password.backButton" }));

    expect(onBack).toHaveBeenCalled();
    expect(stopSpy).toHaveBeenCalled();
  });
});
