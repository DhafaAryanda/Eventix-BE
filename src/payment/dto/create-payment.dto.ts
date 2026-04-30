// // src/payment/dto/create-payment.dto.ts
// import { PaymentMethod } from '@prisma/client';
// import { IsEnum, IsNotEmpty, IsString, ValidateIf } from 'class-validator';

// const VA_BANKS = ['BCA', 'BNI', 'BRI', 'MANDIRI', 'BSI'] as const;
// const EW_CHANNELS = ['GOPAY', 'OVO', 'DANA'] as const;

// export type VaBank = (typeof VA_BANKS)[number];
// export type EwChannel = (typeof EW_CHANNELS)[number];

// export class CreatePaymentDto {
//   @IsEnum(PaymentMethod)
//   paymentMethod: PaymentMethod;

//   // Wajib jika paymentMethod = VA
//   @ValidateIf((o) => o.paymentMethod === PaymentMethod.VA)
//   @IsString()
//   @IsNotEmpty()
//   bankCode?: VaBank;

//   // Wajib jika paymentMethod = EWALLET
//   @ValidateIf((o) => o.paymentMethod === PaymentMethod.EWALLET)
//   @IsString()
//   @IsNotEmpty()
//   ewalletChannel?: EwChannel;

//   // Wajib jika ewalletChannel = OVO
//   @ValidateIf((o) => o.ewalletChannel === 'OVO')
//   @IsString()
//   @IsNotEmpty()
//   mobileNumber?: string;
// }
