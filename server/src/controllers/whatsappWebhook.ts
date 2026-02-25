import { Request, Response } from 'express';
import { queueWhatsappMessage } from '../utils/whatsappService';
// We will also need a direct send method for free-form replies (not templates)
