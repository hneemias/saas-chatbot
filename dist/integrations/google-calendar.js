import { google } from 'googleapis';
export class GoogleCalendarClient {
    getOAuth2Client(config) {
        if (!config.client_id || !config.client_secret || !config.refresh_token) {
            return null;
        }
        const oauth2Client = new google.auth.OAuth2(config.client_id, config.client_secret, 'https://developers.google.com/oauthplayground');
        oauth2Client.setCredentials({
            refresh_token: config.refresh_token,
            access_token: config.access_token,
        });
        return oauth2Client;
    }
    async getCalendarApi(config) {
        const auth = this.getOAuth2Client(config);
        if (!auth) {
            return null;
        }
        return google.calendar({ version: 'v3', auth });
    }
    async listEvents(config, timeMin, timeMax) {
        const calendar = await this.getCalendarApi(config);
        if (!calendar) {
            throw new Error('Google Calendar não está autenticado para esta empresa. Configure no painel administrativo.');
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
    async createEvent(config, eventData) {
        const calendar = await this.getCalendarApi(config);
        if (!calendar) {
            throw new Error('Google Calendar não está autenticado para esta empresa. Configure no painel administrativo.');
        }
        const calendarId = config.calendar_id || 'primary';
        const event = {
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
    async updateEvent(config, eventId, eventData) {
        const calendar = await this.getCalendarApi(config);
        if (!calendar) {
            throw new Error('Google Calendar não está autenticado para esta empresa. Configure no painel administrativo.');
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
