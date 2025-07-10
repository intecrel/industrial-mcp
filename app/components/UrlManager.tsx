'use client'

import { useState } from 'react'

export default function UrlManager() {
  const [urls, setUrls] = useState<string[]>([])
  const [newUrl, setNewUrl] = useState('')

  const addUrl = () => {
    if (newUrl) {
      setUrls([...urls, newUrl])
      setNewUrl('')
    }
  }

  const sendToClaude = async (url: string) => {
    // Implement Claude API call here
    console.log(`Sending ${url} to Claude`)
  }

  return (
    <div className="mt-8">
      <div className="flex gap-2 mb-4">
        <input
          type="url"
          value={newUrl}
          onChange={(e) => setNewUrl(e.target.value)}
          placeholder="Enter URL"
          className="flex-1 p-2 border rounded"
        />
        <button
          onClick={addUrl}
          className="px-4 py-2 bg-blue-500 text-white rounded"
        >
          Add URL
        </button>
      </div>
      <ul className="space-y-2">
        {urls.map((url, index) => (
          <li key={index} className="flex justify-between items-center bg-gray-50 p-2 rounded">
            <span>{url}</span>
            <button
              onClick={() => sendToClaude(url)}
              className="px-3 py-1 bg-green-500 text-white rounded"
            >
              Send to Claude
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}