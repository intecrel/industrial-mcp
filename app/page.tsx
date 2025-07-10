export default function HomePage() {
  return (
    <div>
      <h2 className="text-3xl font-bold mb-4">🔧 Master Control Panel</h2>
      <p className="text-gray-700 mb-6">Welcome to your centralized data control interface.</p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white p-6 shadow rounded">
          <h3 className="text-xl font-semibold mb-2">🧠 Connect Data</h3>
          <p>Sync to Neo4j, Supabase, Airbyte, and internal sources.</p>
        </div>
        <div className="bg-white p-6 shadow rounded">
          <h3 className="text-xl font-semibold mb-2">🔐 Authentication</h3>
          <p>Enable Clerk or Auth.js to manage user access.</p>
        </div>
      </div>
    </div>
  );
}