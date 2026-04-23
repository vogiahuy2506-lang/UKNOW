const CustomerStatCard = ({ title, value, icon: Icon, colorClass = 'text-primary-600' }) => (
  <div className="card">
    <div className="card-body">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-gray-500">{title}</p>
          <p className="mt-2 text-2xl font-semibold text-gray-900">{value}</p>
        </div>
        <div className={`rounded-lg bg-gray-50 p-2 ${colorClass}`}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </div>
  </div>
);

export default CustomerStatCard;
