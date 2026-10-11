import { Route, Switch } from "wouter";
import { Layout } from "./components/Layout";
import { NAV, ROUTES } from "./routes";

function NotFound() {
	return <p className="py-6 text-center text-xs text-faint">ページが見つかりません</p>;
}

function App() {
	return (
		<Layout nav={NAV}>
			<Switch>
				{ROUTES.map(({ path, component }) => (
					<Route key={path} path={path} component={component} />
				))}
				<Route component={NotFound} />
			</Switch>
		</Layout>
	);
}

export default App;
