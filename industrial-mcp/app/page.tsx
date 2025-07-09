import driver from '../lib/neo4j'
import claude from '../lib/claude'
import UrlManager from './components/UrlManager'

export default function HomePage() {
  return (
    <div className="p-8">
      <h2 className="text-3xl font-bold mb-4">🔧 Master Control Panel</h2>
      <p className="text-gray-700 mb-6">Welcome to your centralized data control interface.</p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white p-6 shadow rounded">
          <h3 className="text-xl font-semibold mb-2">🧠 Neo4j Connection</h3>
          <p>Connected to graph database for knowledge management.</p>
        </div>
        <div className="bg-white p-6 shadow rounded">
          <h3 className="text-xl font-semibold mb-2">🤖 Claude Integration</h3>
          <p>AI-powered analysis and assistance enabled.</p>
        </div>
      </div>
      <UrlManager />
    </div>
  );
}