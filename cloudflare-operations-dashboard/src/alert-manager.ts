/**
 * Alert Manager
 * 
 * Handles alert configuration, triggering, and notifications
 */

export interface AlertConfig {
  metric: string;
  threshold: number;
  duration?: string;
  notification: 'discord' | 'telegram' | 'email';
}

export interface Alert {
  id: string;
  timestamp: string;
  metric: string;
  value: number;
  threshold: number;
  severity: 'info' | 'warning' | 'critical';
  message: string;
  triggered: boolean;
}

export class AlertManager {
  private env: any;
  private thresholds: Map<string, AlertConfig> = new Map();
  private alertHistory: Alert[] = [];

  constructor(env: any) {
    this.env = env;
    
    // Default thresholds
    this.setDefaultThresholds();
  }

  private setDefaultThresholds() {
    this.thresholds.set('error_rate', {
      metric: 'error_rate',
      threshold: 5,
      duration: '5m',
      notification: 'discord'
    });
    
    this.thresholds.set('response_time_p95', {
      metric: 'response_time_p95',
      threshold: 1000,
      duration: '10m',
      notification: 'discord'
    });
    
    this.thresholds.set('cost_spike', {
      metric: 'cost_spike',
      threshold: 50, // 50% increase
      notification: 'discord'
    });
    
    this.thresholds.set('quota_usage', {
      metric: 'quota_usage',
      threshold: 90, // 90% of quota
      notification: 'discord'
    });
  }

  async setThreshold(config: AlertConfig) {
    this.thresholds.set(config.metric, config);
  }

  async getThreshold(metric: string): Promise<AlertConfig | undefined> {
    return this.thresholds.get(metric);
  }

  async checkMetric(metric: string, value: number): Promise<Alert | null> {
    const config = this.thresholds.get(metric);
    if (!config) return null;

    const triggered = value > config.threshold;
    
    if (triggered) {
      const alert: Alert = {
        id: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        metric,
        value,
        threshold: config.threshold,
        severity: this.calculateSeverity(value, config.threshold),
        message: this.generateMessage(metric, value, config.threshold),
        triggered: true
      };
      
      this.alertHistory.push(alert);
      await this.sendNotification(alert, config.notification);
      
      return alert;
    }
    
    return null;
  }

  private calculateSeverity(value: number, threshold: number): 'info' | 'warning' | 'critical' {
    const ratio = value / threshold;
    
    if (ratio >= 2) return 'critical';
    if (ratio >= 1.5) return 'warning';
    return 'info';
  }

  private generateMessage(metric: string, value: number, threshold: number): string {
    const messages: Record<string, string> = {
      error_rate: `⚠️ High error rate detected: ${value.toFixed(2)}% (threshold: ${threshold}%)`,
      response_time_p95: `⏱️ Slow response time: ${value}ms (threshold: ${threshold}ms)`,
      cost_spike: `💰 Cost spike detected: +${value}% increase (threshold: ${threshold}%)`,
      quota_usage: `📊 Quota usage high: ${value}% (threshold: ${threshold}%)`
    };
    
    return messages[metric] || `Alert: ${metric} = ${value} (threshold: ${threshold})`;
  }

  private async sendNotification(alert: Alert, channel: string) {
    switch (channel) {
      case 'discord':
        await this.sendDiscordNotification(alert);
        break;
      case 'telegram':
        await this.sendTelegramNotification(alert);
        break;
      case 'email':
        // Email notifications not implemented yet
        console.log('Email notifications not implemented');
        break;
    }
  }

  private async sendDiscordNotification(alert: Alert) {
    if (!this.env.DISCORD_WEBHOOK_URL) {
      console.warn('Discord webhook URL not configured');
      return;
    }

    const color = {
      info: 0x3b82f6,
      warning: 0xf59e0b,
      critical: 0xef4444
    }[alert.severity];

    const embed = {
      title: '🚨 Cloudflare Operations Alert',
      description: alert.message,
      color,
      fields: [
        { name: 'Metric', value: alert.metric, inline: true },
        { name: 'Value', value: alert.value.toString(), inline: true },
        { name: 'Threshold', value: alert.threshold.toString(), inline: true },
        { name: 'Severity', value: alert.severity.toUpperCase(), inline: true }
      ],
      timestamp: alert.timestamp
    };

    try {
      await fetch(this.env.DISCORD_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ embeds: [embed] })
      });
    } catch (error) {
      console.error('Failed to send Discord notification:', error);
    }
  }

  private async sendTelegramNotification(alert: Alert) {
    if (!this.env.TELEGRAM_BOT_TOKEN || !this.env.TELEGRAM_CHAT_ID) {
      console.warn('Telegram credentials not configured');
      return;
    }

    const emoji = {
      info: 'ℹ️',
      warning: '⚠️',
      critical: '🚨'
    }[alert.severity];

    const message = `${emoji} *Cloudflare Operations Alert*\n\n${alert.message}\n\n` +
      `*Metric:* ${alert.metric}\n` +
      `*Value:* ${alert.value}\n` +
      `*Threshold:* ${alert.threshold}\n` +
      `*Severity:* ${alert.severity.toUpperCase()}`;

    try {
      await fetch(`https://api.telegram.org/bot${this.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: this.env.TELEGRAM_CHAT_ID,
          text: message,
          parse_mode: 'Markdown'
        })
      });
    } catch (error) {
      console.error('Failed to send Telegram notification:', error);
    }
  }

  async sendTestAlert() {
    const testAlert: Alert = {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      metric: 'test',
      value: 100,
      threshold: 50,
      severity: 'info',
      message: '✅ Test alert - Dashboard notifications working!',
      triggered: true
    };
    
    await this.sendNotification(testAlert, 'discord');
    await this.sendNotification(testAlert, 'telegram');
  }

  async getHistory(timeframe: string, filters?: { severity?: string }) {
    let history = [...this.alertHistory];
    
    // Filter by timeframe
    const cutoff = this.parseTimeframe(timeframe);
    history = history.filter(alert => new Date(alert.timestamp) >= cutoff);
    
    // Filter by severity
    if (filters?.severity) {
      history = history.filter(alert => alert.severity === filters.severity);
    }
    
    return history.sort((a, b) => 
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  }

  private parseTimeframe(timeframe: string): Date {
    const match = timeframe.match(/^(\d+)([hdwm])$/);
    if (!match) return new Date(0);
    
    const [, amount, unit] = match;
    const now = new Date();
    
    switch (unit) {
      case 'h':
        return new Date(now.getTime() - parseInt(amount) * 60 * 60 * 1000);
      case 'd':
        return new Date(now.getTime() - parseInt(amount) * 24 * 60 * 60 * 1000);
      case 'w':
        return new Date(now.getTime() - parseInt(amount) * 7 * 24 * 60 * 60 * 1000);
      case 'm':
        return new Date(now.getTime() - parseInt(amount) * 30 * 24 * 60 * 60 * 1000);
      default:
        return new Date(0);
    }
  }
}
