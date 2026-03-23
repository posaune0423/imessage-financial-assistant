import type { TurnkeyOwnershipAuthAdapter } from "./interfaces";

export class TurnkeyOwnershipAuthService implements TurnkeyOwnershipAuthAdapter {
  async initOtp(_contact: string): Promise<{ otpId: string }> {
    throw new Error("Ownership-authenticated actions are not implemented in this phase");
  }

  async verifyOtp(_otpId: string, _otpCode: string): Promise<{ verificationToken: string }> {
    throw new Error("Ownership-authenticated actions are not implemented in this phase");
  }
}
