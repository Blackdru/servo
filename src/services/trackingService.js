const prisma = require('../config/database');
const logger = require('../config/logger');

class TrackingService {
  // Parse user agent to extract device, browser, and OS info
  parseUserAgent(userAgent) {
    if (!userAgent) return { device: 'unknown', browser: 'unknown', os: 'unknown' };

    const device = /Mobile|Android|iPhone|iPad/.test(userAgent) ? 'mobile' : 'desktop';
    
    let browser = 'unknown';
    if (userAgent.includes('Chrome')) browser = 'chrome';
    else if (userAgent.includes('Firefox')) browser = 'firefox';
    else if (userAgent.includes('Safari')) browser = 'safari';
    else if (userAgent.includes('Edge')) browser = 'edge';

    let os = 'unknown';
    if (userAgent.includes('Windows')) os = 'windows';
    else if (userAgent.includes('Mac')) os = 'macos';
    else if (userAgent.includes('Linux')) os = 'linux';
    else if (userAgent.includes('Android')) os = 'android';
    else if (userAgent.includes('iOS')) os = 'ios';

    return { device, browser, os };
  }

  // Track visitor
  async trackVisitor(data) {
    try {
      const {
        sessionId,
        ipAddress,
        userAgent,
        referrer,
        landingPage,
        country,
        city
      } = data;

      const { device, browser, os } = this.parseUserAgent(userAgent);

      // Check if visitor exists
      const existingVisitor = await prisma.visitorTracking.findFirst({
        where: { sessionId }
      });

      if (existingVisitor) {
        // Update existing visitor
        const updatedVisitor = await prisma.visitorTracking.update({
          where: { id: existingVisitor.id },
          data: {
            lastVisit: new Date(),
            pageViews: existingVisitor.pageViews + 1,
            isReturning: true
          }
        });
        return updatedVisitor;
      } else {
        // Create new visitor record
        const newVisitor = await prisma.visitorTracking.create({
          data: {
            sessionId,
            ipAddress,
            userAgent,
            country,
            city,
            device,
            browser,
            os,
            referrer,
            landingPage,
            firstVisit: new Date(),
            lastVisit: new Date()
          }
        });
        return newVisitor;
      }
    } catch (error) {
      logger.error('Error tracking visitor:', error);
      throw error;
    }
  }

  // Track download
  async trackDownload(sessionId, source = 'website') {
    try {
      // Update visitor record to mark app as downloaded
      const visitor = await prisma.visitorTracking.findFirst({
        where: { sessionId }
      });

      if (visitor && !visitor.appDownloaded) {
        await prisma.visitorTracking.update({
          where: { id: visitor.id },
          data: {
            appDownloaded: true,
            downloadedAt: new Date()
          }
        });
      }

      // Also create download tracking record
      await prisma.downloadTracking.create({
        data: {
          source,
          userAgent: visitor?.userAgent,
          ipAddress: visitor?.ipAddress,
          timestamp: new Date()
        }
      });

      logger.info(`Download tracked for session ${sessionId}`);
    } catch (error) {
      logger.error('Error tracking download:', error);
      throw error;
    }
  }

  // Update visit duration
  async updateVisitDuration(sessionId, duration) {
    try {
      await prisma.visitorTracking.updateMany({
        where: { sessionId },
        data: { visitDuration: duration }
      });
    } catch (error) {
      logger.error('Error updating visit duration:', error);
    }
  }

  // Get visitor analytics
  async getAnalytics(timeframe = '7d') {
    try {
      const now = new Date();
      let startDate;

      switch (timeframe) {
        case '1d':
          startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
          break;
        case '7d':
          startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          break;
        case '30d':
          startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
          break;
        default:
          startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      }

      const [
        totalVisitors,
        uniqueVisitors,
        returningVisitors,
        totalDownloads,
        conversionRate,
        topCountries,
        deviceBreakdown,
        browserBreakdown
      ] = await Promise.all([
        // Total page views
        prisma.visitorTracking.aggregate({
          where: { firstVisit: { gte: startDate } },
          _sum: { pageViews: true }
        }),
        // Unique visitors
        prisma.visitorTracking.count({
          where: { firstVisit: { gte: startDate } }
        }),
        // Returning visitors
        prisma.visitorTracking.count({
          where: { 
            firstVisit: { gte: startDate },
            isReturning: true 
          }
        }),
        // Total downloads
        prisma.visitorTracking.count({
          where: { 
            firstVisit: { gte: startDate },
            appDownloaded: true 
          }
        }),
        // For conversion rate calculation
        prisma.visitorTracking.findMany({
          where: { firstVisit: { gte: startDate } },
          select: { appDownloaded: true }
        }),
        // Top countries
        prisma.visitorTracking.groupBy({
          by: ['country'],
          where: { 
            firstVisit: { gte: startDate },
            country: { not: null }
          },
          _count: { country: true },
          orderBy: { _count: { country: 'desc' } },
          take: 5
        }),
        // Device breakdown
        prisma.visitorTracking.groupBy({
          by: ['device'],
          where: { firstVisit: { gte: startDate } },
          _count: { device: true }
        }),
        // Browser breakdown
        prisma.visitorTracking.groupBy({
          by: ['browser'],
          where: { firstVisit: { gte: startDate } },
          _count: { browser: true }
        })
      ]);

      const conversionRateCalc = totalDownloads / (uniqueVisitors || 1) * 100;

      return {
        totalPageViews: totalVisitors._sum.pageViews || 0,
        uniqueVisitors: uniqueVisitors || 0,
        returningVisitors: returningVisitors || 0,
        totalDownloads: totalDownloads || 0,
        conversionRate: Math.round(conversionRateCalc * 100) / 100,
        topCountries: topCountries.map(c => ({
          country: c.country,
          visitors: c._count.country
        })),
        deviceBreakdown: deviceBreakdown.map(d => ({
          device: d.device,
          count: d._count.device
        })),
        browserBreakdown: browserBreakdown.map(b => ({
          browser: b.browser,
          count: b._count.browser
        }))
      };
    } catch (error) {
      logger.error('Error getting analytics:', error);
      throw error;
    }
  }

  // Get visitor details
  async getVisitorDetails(limit = 100, offset = 0) {
    try {
      const visitors = await prisma.visitorTracking.findMany({
        orderBy: { firstVisit: 'desc' },
        take: limit,
        skip: offset,
        select: {
          id: true,
          sessionId: true,
          ipAddress: true,
          country: true,
          city: true,
          device: true,
          browser: true,
          os: true,
          referrer: true,
          landingPage: true,
          pageViews: true,
          appDownloaded: true,
          downloadedAt: true,
          firstVisit: true,
          lastVisit: true,
          visitDuration: true,
          isReturning: true
        }
      });

      const total = await prisma.visitorTracking.count();

      return {
        visitors,
        total,
        hasMore: offset + limit < total
      };
    } catch (error) {
      logger.error('Error getting visitor details:', error);
      throw error;
    }
  }
}

module.exports = new TrackingService();