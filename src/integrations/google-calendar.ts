import { google, calendar_v3 } from 'googleapis';
import { logger } from '../utils/logger.js';

export interface CalendarConfig {
  enabled?: boolean;
  calendar_id?: string;
  client_id?: string;
  client_secret?: string;
  refresh_token?: string;
  access_token?: string;
  work_days?: number[]; // [1, 2, 3, 4, 5] (Seg a Sex)
  business_start?: string; // "09:00"
  business_end?: string; // "18:00"
  lunch_start?: string; // "12:00"
  lunch_end?: string; // "13:00"
  slot_duration_minutes?: number; // 60
}

export class GoogleCalendarClient {
  private getOAuth2Client(config: CalendarConfig) {
    if (!config.client_id || !config.client_secret || !config.refresh_token) {
      return null;
    }

    const oauth2Client = new google.auth.OAuth2(
      config.client_id,
      config.client_secret,
      'https://developers.google.com/oauthplayground'
    );

    oauth2Client.setCredentials({
      refresh_token: config.refresh_token,
      access_token: config.access_token,
    });

    return oauth2Client;
  }

  async getCalendarApi(config: CalendarConfig): Promise<calendar_v3.Calendar | null> {
    const auth = this.getOAuth2Client(config);
    if (!auth) {
      return null;
    }
    return google.calendar({ version: 'v3', auth });
  }

  async listEvents(
    config: CalendarConfig,
    timeMin: string,
    timeMax: string
  ): Promise<calendar_v3.Schema$Event[]> {
    const calendar = await this.getCalendarApi(config);
    if (!calendar) {
      throw new Error('Google Calendar não está autenticado para este escritório. Configure no painel administrativo.');
    }

    const calendarId = config.calendar_id || 'primary';

    const res = await calendar.events.list({
      calendarId,
      timeMin,
      timeMax,
      singleEvents: true,
      orderBy: 'startTime',
    });

    return res.data.items || [];
  }

  async createEvent(
    config: CalendarConfig,
    eventData: {
      summary: string;
      description?: string;
      startTime: string; // ISO string
      endTime: string; // ISO string
      attendeeEmail?: string;
    }
  ): Promise<calendar_v3.Schema$Event> {
    const calendar = await this.getCalendarApi(config);
    if (!calendar) {
      throw new Error('Google Calendar não está autenticado para este escritório. Configure no painel administrativo.');
    }

    const calendarId = config.calendar_id || 'primary';

    const event: calendar_v3.Schema$Event = {
      summary: eventData.summary,
      description: eventData.description,
      start: {
        dateTime: eventData.startTime,
        timeZone: 'America/Sao_Paulo',
      },
      end: {
        dateTime: eventData.endTime,
        timeZone: 'America/Sao_Paulo',
      },
    };

    if (eventData.attendeeEmail) {
      event.attendees = [{ email: eventData.attendeeEmail }];
    }

    const res = await calendar.events.insert({
      calendarId,
      requestBody: event,
    });

    return res.data;
  }

  async updateEvent(
    config: CalendarConfig,
    eventId: string,
    eventData: {
      summary?: string;
      description?: string;
      startTime: string;
      endTime: string;
    }
  ): Promise<calendar_v3.Schema$Event> {
    const calendar = await this.getCalendarApi(config);
    if (!calendar) {
      throw new Error('Google Calendar não está autenticado para este escritório. Configure no painel administrativo.');
    }

    const calendarId = config.calendar_id || 'primary';

    const res = await calendar.events.patch({
      calendarId,
      eventId,
      requestBody: {
        summary: eventData.summary,
        description: eventData.description,
        start: {
          dateTime: eventData.startTime,
          timeZone: 'America/Sao_Paulo',
        },
        end: {
          dateTime: eventData.endTime,
          timeZone: 'America/Sao_Paulo',
        },
      },
    });

    return res.data;
  }
}

export const googleCalendar = new GoogleCalendarClient();
