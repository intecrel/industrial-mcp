'use client'

/**
 * Audit Dashboard Page
 * Provides web interface for viewing and filtering audit events
 */

import React from 'react'
import { useRouter } from 'next/navigation'
import AuditDashboard from '@/app/components/AuditDashboard'

export default function AuditPage() {
  const router = useRouter()

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Audit Dashboard</h1>
              <p className="text-sm text-gray-600 mt-1">
                Monitor and analyze audit events from Neo4j write operations
              </p>
            </div>
            <button
              onClick={() => router.push('/dashboard')}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              ← Back to Dashboard
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <AuditDashboard />
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-gray-200 mt-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="text-center text-sm text-gray-500">
            <p>
              Industrial MCP Audit System • Real-time audit trail with 10-second batch flushing
            </p>
            <p className="mt-1">
              Events: Neo4j CREATE, MERGE, SET operations • Storage: MySQL Cloud SQL
            </p>
          </div>
        </div>
      </footer>
    </div>
  )
}
