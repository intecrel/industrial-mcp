'use client'

import { signIn } from 'next-auth/react'
import { FormEvent } from 'react'

export default function Login() {
  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    
    await signIn('credentials', {
      username: formData.get('username'),
      password: formData.get('password'),
      redirect: true,
      callbackUrl: '/'
    })
  }

  return (
    <div className="flex min-h-screen items-center justify-center">
      <form onSubmit={handleSubmit} className="space-y-4 w-full max-w-sm p-6 bg-white rounded shadow">
        <h1 className="text-2xl font-bold mb-6">Login to MCP</h1>
        <input
          name="username"
          type="text"
          placeholder="Username"
          className="w-full p-2 border rounded"
          required
        />
        <input
          name="password"
          type="password"
          placeholder="Password"
          className="w-full p-2 border rounded"
          required
        />
        <button
          type="submit"
          className="w-full p-2 bg-blue-500 text-white rounded hover:bg-blue-600"
        >
          Sign In
        </button>
      </form>
    </div>
  )
}