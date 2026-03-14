"""
WeLearn 自动学习工具 - 主窗口
多用户管理中心
"""
from PyQt5.QtWidgets import (
    QMainWindow, QAction,
    QMessageBox, QStatusBar
)

from ui.account_view import AccountView
from ui.account_detail import AccountDetailDialog
from core.account_manager import Account


class WeLearnUI(QMainWindow):
    """
    主窗口
    现在作为多用户管理中心
    """
    
    def __init__(self):
        super().__init__()
        self.detail_dialogs = {}  # 存储打开的详情对话框
        self.init_ui()
    
    def init_ui(self):
        self.setWindowTitle("WeLearn 自动学习工具 - 多用户版")
        self.setGeometry(120, 80, 1180, 760)
        self.setMinimumSize(980, 640)
        
        # 设置样式
        self.setStyleSheet("""
            QMainWindow {
                background-color: #f4efe6;
                color: #18212f;
            }
            QMenuBar {
                background: #f8f4eb;
                border-bottom: 1px solid #e3d8c6;
                padding: 6px 10px;
                spacing: 6px;
            }
            QMenuBar::item {
                background: transparent;
                border-radius: 8px;
                padding: 8px 12px;
            }
            QMenuBar::item:selected {
                background: #efe2ca;
            }
            QMenu {
                background: #fffaf0;
                border: 1px solid #decfb7;
                padding: 6px;
            }
            QMenu::item {
                padding: 8px 18px;
                border-radius: 8px;
            }
            QMenu::item:selected {
                background: #efe2ca;
            }
            QGroupBox {
                font-weight: bold;
                color: #18212f;
                border: 1px solid #e3d8c6;
                border-radius: 16px;
                margin-top: 14px;
                padding-top: 18px;
                background: #fffaf0;
            }
            QGroupBox::title {
                subcontrol-origin: margin;
                left: 14px;
                padding: 0 8px;
                color: #6c4f2a;
            }
            QPushButton {
                background-color: #1d6b50;
                border: none;
                color: white;
                padding: 10px 18px;
                font-size: 13px;
                font-weight: 600;
                border-radius: 12px;
            }
            QPushButton:hover {
                background-color: #175740;
            }
            QPushButton:disabled {
                background-color: #c8c0b5;
                color: #6f675b;
            }
            QTableWidget {
                border: 1px solid #e4d9c8;
                border-radius: 16px;
                background-color: #fffdf8;
                alternate-background-color: #faf4ea;
                gridline-color: #efe5d6;
                selection-background-color: #e3efe8;
            }
            QTableWidget::item:selected {
                color: #18212f;
            }
            QHeaderView::section {
                background-color: #f7efe3;
                color: #6c4f2a;
                padding: 10px 12px;
                border: none;
                border-bottom: 1px solid #e4d9c8;
                font-weight: bold;
            }
            QLineEdit, QComboBox, QSpinBox, QListWidget, QTextEdit {
                background: #fffdf8;
                border: 1px solid #decfb7;
                border-radius: 12px;
                padding: 8px 10px;
                color: #18212f;
            }
            QLineEdit:focus, QComboBox:focus, QSpinBox:focus, QListWidget:focus, QTextEdit:focus {
                border: 1px solid #1d6b50;
            }
            QListWidget {
                padding: 6px;
            }
            QListWidget::item {
                padding: 8px 10px;
                border-radius: 10px;
            }
            QListWidget::item:selected {
                background: #e3efe8;
                color: #18212f;
            }
            QProgressBar {
                border: 1px solid #decfb7;
                border-radius: 10px;
                background: #f5ede1;
                text-align: center;
                color: #18212f;
            }
            QProgressBar::chunk {
                background: #1d6b50;
                border-radius: 9px;
            }
            QStatusBar {
                background: #f8f4eb;
                border-top: 1px solid #e3d8c6;
                color: #6d6253;
            }
            QFrame#HeroPanel, QFrame#ToolbarPanel, QFrame#TablePanel, QFrame#SummaryCard {
                background: #fffaf0;
                border: 1px solid #e3d8c6;
                border-radius: 18px;
            }
            QLabel#HeroEyebrow {
                color: #8f6f49;
                font-size: 11px;
                font-weight: 700;
                letter-spacing: 1px;
            }
            QLabel#HeroTitle {
                color: #18212f;
                font-size: 26px;
                font-weight: 700;
            }
            QLabel#HeroSubtitle, QLabel#SectionHint, QLabel#FooterInfo {
                color: #6d6253;
                font-size: 13px;
            }
            QLabel#SectionTitle {
                color: #18212f;
                font-size: 18px;
                font-weight: 700;
            }
            QLabel#SectionLabel, QLabel#MetricTitle {
                color: #8f6f49;
                font-size: 12px;
                font-weight: 700;
            }
            QLabel#MetricValue {
                color: #18212f;
                font-size: 26px;
                font-weight: 700;
            }
        """)
        
        # ========== 菜单栏 ==========
        self.create_menu_bar()
        
        # ========== 中心控件：账号视图 ==========
        self.account_view = AccountView()
        self.account_view.open_detail_requested.connect(self.open_account_detail)
        self.setCentralWidget(self.account_view)
        
        # ========== 状态栏 ==========
        self.status_bar = QStatusBar()
        self.setStatusBar(self.status_bar)
        self.status_bar.showMessage("就绪 - 本地账号会自动保存到 data/desktop_accounts.json")
    
    def create_menu_bar(self):
        """创建菜单栏"""
        menu_bar = self.menuBar()
        
        # 文件菜单
        file_menu = menu_bar.addMenu("文件(&F)")
        
        import_action = QAction("导入账号(&I)", self)
        import_action.setShortcut("Ctrl+I")
        import_action.triggered.connect(lambda: self.account_view.import_accounts())
        file_menu.addAction(import_action)
        
        export_action = QAction("导出账号(&E)", self)
        export_action.setShortcut("Ctrl+E")
        export_action.triggered.connect(lambda: self.account_view.export_accounts())
        file_menu.addAction(export_action)
        
        file_menu.addSeparator()
        
        exit_action = QAction("退出(&X)", self)
        exit_action.setShortcut("Ctrl+Q")
        exit_action.triggered.connect(self.close)
        file_menu.addAction(exit_action)
        
        # 帮助菜单
        help_menu = menu_bar.addMenu("帮助(&H)")
        
        about_action = QAction("关于(&A)", self)
        about_action.triggered.connect(self.show_about)
        help_menu.addAction(about_action)
        
        github_action = QAction("GitHub 项目", self)
        github_action.triggered.connect(self.open_github)
        help_menu.addAction(github_action)
    
    def open_account_detail(self, account: Account):
        """打开账号详情对话框"""
        username = account.username  # 先保存用户名
        
        # 如果已经打开了该账号的详情，则激活它
        if username in self.detail_dialogs:
            dialog = self.detail_dialogs[username]
            if dialog.isVisible():
                dialog.raise_()
                dialog.activateWindow()
                return
            else:
                # 对话框已关闭但未从字典移除，先清理
                del self.detail_dialogs[username]
        
        # 创建新的详情对话框
        dialog = AccountDetailDialog(account, self)
        dialog.status_updated.connect(self.on_account_status_updated)
        # 使用默认参数捕获 username 的值，而不是引用
        dialog.finished.connect(lambda result, u=username: self.on_detail_closed(u))
        
        self.detail_dialogs[username] = dialog
        dialog.show()
        self.status_bar.showMessage(f"已打开账号详情: {username}")
    
    def on_account_status_updated(self, username: str, status: str, progress: str):
        """账号状态更新回调"""
        self.account_view.update_account_status(username, status, progress)
    
    def on_detail_closed(self, username: str):
        """详情对话框关闭回调"""
        if username in self.detail_dialogs:
            del self.detail_dialogs[username]
        self.account_view.refresh_table()
    
    def show_about(self):
        """显示关于对话框"""
        QMessageBox.about(
            self,
            "关于 WeLearn 自动学习工具",
            """
            <h3>WeLearn 自动学习工具</h3>
            <p>版本: 2.0 (多用户版)</p>
            <p>仓库: server0608/Auto_WeLearn</p>
            <hr>
            <p>本人是一位来自黑大的苦逼学生，因不满校内各种付费代刷课，所以制作了这款软件。</p>
            <p><b>软件仅供学习参考使用，永久免费禁止倒卖</b></p>
            <p>禁止使用软件进行任何代刷牟利，以此造成的任何问题本人不负责任。</p>
            <hr>
            <p>有任何问题欢迎在仓库中提交 Issue。</p>
            """
        )
    
    def open_github(self):
        """打开 GitHub 项目页面"""
        import webbrowser
        webbrowser.open("https://github.com/server0608/Auto_WeLearn")
    
    def closeEvent(self, event):
        """关闭窗口时清理"""
        # 关闭所有详情对话框
        for dialog in list(self.detail_dialogs.values()):
            dialog.close()
            if dialog.isVisible():
                self.status_bar.showMessage("仍有任务窗口在关闭中，请稍后再退出。")
                event.ignore()
                return
        self.detail_dialogs.clear()
        
        # 强制退出应用
        from PyQt5.QtWidgets import QApplication
        QApplication.quit()
        event.accept()
