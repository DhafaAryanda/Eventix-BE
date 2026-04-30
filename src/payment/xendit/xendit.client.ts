// src/payment/xendit/xendit.client.ts
import {
  Injectable,
  Logger,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance, AxiosError } from 'axios';
import { CreateInvoiceRequest, XenditInvoiceResponse } from './xendit.types';

@Injectable()
export class XenditClient {
  private readonly logger = new Logger(XenditClient.name);
  private readonly http: AxiosInstance;

  constructor(private config: ConfigService) {
    const secretKey = this.config.get<string>('XENDIT_SECRET_KEY');
    if (!secretKey) {
      throw new InternalServerErrorException(
        'XENDIT_SECRET_KEY belum dikonfigurasi',
      );
    }

    this.http = axios.create({
      baseURL: 'https://api.xendit.co',
      // Xendit pakai Basic Auth: secret key sebagai username,
      // password dikosongkan
      auth: {
        username: secretKey,
        password: '',
      },
      headers: {
        'Content-Type': 'application/json',
      },
      timeout: 10_000, // 10 detik timeout
    });

    // Interceptor untuk logging semua request
    this.http.interceptors.request.use((req) => {
      this.logger.debug(`Xendit → ${req.method?.toUpperCase()} ${req.url}`);
      return req;
    });

    // Interceptor untuk logging semua response
    this.http.interceptors.response.use(
      (res) => {
        this.logger.debug(`Xendit ← ${res.status} ${res.config.url}`);
        return res;
      },
      (error: AxiosError) => {
        this.logger.error(
          `Xendit error: ${error.response?.status} ` +
            `${JSON.stringify(error.response?.data)}`,
        );
        return Promise.reject(error);
      },
    );
  }

  // // ===========================
  // // VIRTUAL ACCOUNT
  // // ===========================
  // async createVA(payload: CreateVARequest): Promise<XenditVAResponse> {
  //   try {
  //     const { data } = await this.http.post<XenditVAResponse>(
  //       '/callback_virtual_accounts',
  //       payload,
  //     );
  //     return data;
  //   } catch (err) {
  //     this.handleXenditError(err, 'createVA');
  //   }
  // }

  // // ===========================
  // // QRIS
  // // ===========================
  // async createQRIS(payload: CreateQRISRequest): Promise<XenditQRISResponse> {
  //   try {
  //     const { data } = await this.http.post<XenditQRISResponse>(
  //       '/qr_codes',
  //       payload,
  //     );
  //     return data;
  //   } catch (err) {
  //     this.handleXenditError(err, 'createQRIS');
  //   }
  // }

  // // ===========================
  // // E-WALLET
  // // ===========================
  // async createEWallet(
  //   payload: CreateEWalletRequest,
  // ): Promise<XenditEWalletResponse> {
  //   try {
  //     const { data } = await this.http.post<XenditEWalletResponse>(
  //       '/ewallets/charges',
  //       payload,
  //     );
  //     return data;
  //   } catch (err) {
  //     this.handleXenditError(err, 'createEWallet');
  //   }
  // }

  // async createInvoice(payload: any) {
  //   try {
  //     const { data } = await this.http.post('/v2/invoices', payload);
  //     return data;
  //   } catch (err) {
  //     this.handleXenditError(err, 'createInvoice');
  //   }
  // }

  // ===========================
  // CREATE INVOICE
  // Satu method untuk semua metode pembayaran
  // ===========================
  async createInvoice(
    payload: CreateInvoiceRequest,
  ): Promise<XenditInvoiceResponse> {
    try {
      const { data } = await this.http.post<XenditInvoiceResponse>(
        '/v2/invoices',
        payload,
      );
      return data;
    } catch (err) {
      this.handleError(err, 'createInvoice');
    }
  }

  // ===========================
  // GET INVOICE — untuk cek status manual jika perlu
  // ===========================
  async getInvoice(invoiceId: string): Promise<XenditInvoiceResponse> {
    try {
      const { data } = await this.http.get<XenditInvoiceResponse>(
        `/v2/invoices/${invoiceId}`,
      );
      return data;
    } catch (err) {
      this.handleError(err, 'getInvoice');
    }
  }

  private handleError(err: unknown, method: string): never {
    if (axios.isAxiosError(err)) {
      const status = err.response?.status;
      const message = err.response?.data?.message ?? err.message;
      this.logger.error(`Xendit ${method} failed: [${status}] ${message}`);
      throw new InternalServerErrorException(
        `Gagal memproses pembayaran: ${message}`,
      );
    }
    throw err;
  }
}

// // ===========================
// // ERROR HANDLER
// // ===========================
// private handleXenditError(err: unknown, method: string): never {
//   if (axios.isAxiosError(err)) {
//     const status = err.response?.status;
//     const message = err.response?.data?.message ?? err.message;

//     this.logger.error(`Xendit ${method} failed: [${status}] ${message}`);

//     // Lempar error yang informatif ke service
//     throw new InternalServerErrorException(
//       `Gagal membuat pembayaran: ${message}`,
//     );
//   }
//   throw err;
// }
// }
